package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

// Router wires the JSON API over the in-memory Store.
type Router struct {
	s   *Store
	mux *http.ServeMux
}

// NewRouter builds the HTTP handler. All routes are under /api so nginx can
// reverse-proxy `dr.ximg.app/api/` straight through to this service.
func NewRouter(s *Store) http.Handler {
	r := &Router{s: s, mux: http.NewServeMux()}
	r.mux.HandleFunc("GET /api/health", r.health)
	r.mux.HandleFunc("GET /api/meta", r.meta)
	r.mux.HandleFunc("GET /api/areas", r.areas)
	r.mux.HandleFunc("GET /api/areas/{id}", r.area)
	r.mux.HandleFunc("GET /api/hotels", r.hotels)
	r.mux.HandleFunc("GET /api/hotels/{id}", r.hotel)
	r.mux.HandleFunc("GET /api/compare", r.compare)
	r.mux.HandleFunc("POST /api/score", r.score)
	return logmw(cors(r.mux))
}

func (r *Router) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *Router) meta(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"areas":           len(r.s.Data.Areas),
		"hotels":          len(r.s.Data.Hotels),
		"generatedAt":     r.s.Data.GeneratedAt,
		"schemaVersion":   r.s.Data.SchemaVersion,
		"areaDimensions":  areaDimensions,
		"hotelDimensions": hotelDimensions,
	})
}

func (r *Router) areas(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, r.s.Data.Areas)
}

func (r *Router) area(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	a := r.s.areaByID[id]
	if a == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "area not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"area": a, "hotels": r.s.hotelsByArea[id]})
}

func (r *Router) hotels(w http.ResponseWriter, req *http.Request) {
	q := req.URL.Query()
	list := make([]*Hotel, 0, len(r.s.Data.Hotels))
	for i := range r.s.Data.Hotels {
		list = append(list, &r.s.Data.Hotels[i])
	}
	if v := q.Get("area"); v != "" {
		list = filterHotels(list, func(h *Hotel) bool { return h.AreaID == v })
	}
	if v := q.Get("board"); v != "" {
		list = filterHotels(list, func(h *Hotel) bool { return strings.EqualFold(h.Board, v) })
	}
	if q.Get("adults_only") == "true" {
		list = filterHotels(list, func(h *Hotel) bool { return h.AdultsOnly })
	}
	if q.Get("family") == "true" {
		list = filterHotels(list, func(h *Hotel) bool { return h.FamilyFriendly })
	}
	if q.Get("beachfront") == "true" {
		list = filterHotels(list, func(h *Hotel) bool { return h.Beachfront })
	}
	if v := q.Get("max_price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			list = filterHotels(list, func(h *Hotel) bool { return h.PricePerNightUSD <= f })
		}
	}
	if v := q.Get("min_rating"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			list = filterHotels(list, func(h *Hotel) bool { return h.GuestRating >= f })
		}
	}
	sortHotels(list, q.Get("sort"))
	writeJSON(w, http.StatusOK, list)
}

func (r *Router) hotel(w http.ResponseWriter, req *http.Request) {
	h := r.s.hotelByID[req.PathValue("id")]
	if h == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "hotel not found"})
		return
	}
	writeJSON(w, http.StatusOK, h)
}

// compare returns the selected entities in request order for side-by-side UI.
// ?type=area|hotel (default hotel), ?ids=a,b,c
func (r *Router) compare(w http.ResponseWriter, req *http.Request) {
	q := req.URL.Query()
	ids := splitComma(q.Get("ids"))
	if q.Get("type") == "area" {
		out := make([]*Area, 0, len(ids))
		for _, id := range ids {
			if a := r.s.areaByID[id]; a != nil {
				out = append(out, a)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"type": "area", "areas": out})
		return
	}
	out := make([]*Hotel, 0, len(ids))
	for _, id := range ids {
		if h := r.s.hotelByID[id]; h != nil {
			out = append(out, h)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"type": "hotel", "hotels": out})
}

type scoreReq struct {
	Type    string             `json:"type"`
	Weights map[string]float64 `json:"weights"`
	Area    string             `json:"area"`
}

// score ranks areas or hotels by user-supplied dimension weights (the "which
// part of the DR / which hotel suits you" engine).
func (r *Router) score(w http.ResponseWriter, req *http.Request) {
	var body scoreReq
	if req.Body != nil {
		_ = json.NewDecoder(req.Body).Decode(&body)
	}
	if body.Type == "area" {
		writeJSON(w, http.StatusOK, map[string]any{
			"type":    "area",
			"results": ScoreAreas(r.s.Data.Areas, body.Weights),
		})
		return
	}
	list := make([]*Hotel, 0, len(r.s.Data.Hotels))
	for i := range r.s.Data.Hotels {
		h := &r.s.Data.Hotels[i]
		if body.Area == "" || h.AreaID == body.Area {
			list = append(list, h)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"type":    "hotel",
		"results": r.s.ScoreHotels(list, body.Weights),
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func logmw(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		h.ServeHTTP(w, r)
	})
}

func filterHotels(in []*Hotel, keep func(*Hotel) bool) []*Hotel {
	out := in[:0:0]
	for _, h := range in {
		if keep(h) {
			out = append(out, h)
		}
	}
	return out
}

func splitComma(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func sortHotels(list []*Hotel, mode string) {
	switch mode {
	case "price":
		sort.SliceStable(list, func(i, j int) bool { return list[i].PricePerNightUSD < list[j].PricePerNightUSD })
	case "price_desc":
		sort.SliceStable(list, func(i, j int) bool { return list[i].PricePerNightUSD > list[j].PricePerNightUSD })
	case "stars":
		sort.SliceStable(list, func(i, j int) bool { return list[i].Stars > list[j].Stars })
	case "name":
		sort.SliceStable(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	default:
		sort.SliceStable(list, func(i, j int) bool { return list[i].GuestRating > list[j].GuestRating })
	}
}
