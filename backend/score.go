package main

import (
	"math"
	"sort"
	"strings"
)

// ── Area scoring ──────────────────────────────────────────────────────────────

// areaDimensions are the weightable axes for ranking areas. "low_sargassum" is
// derived from SargassumRisk (Low risk -> high score).
var areaDimensions = []string{
	"beach", "nightlife", "family", "value",
	"nature", "culture", "safety", "walkability", "low_sargassum",
}

func areaDimValue(a *Area, dim string) float64 {
	switch dim {
	case "beach":
		return a.Scores.Beach
	case "nightlife":
		return a.Scores.Nightlife
	case "family":
		return a.Scores.Family
	case "value":
		return a.Scores.Value
	case "nature":
		return a.Scores.Nature
	case "culture":
		return a.Scores.Culture
	case "safety":
		return a.Scores.Safety
	case "walkability":
		return a.Scores.Walkability
	case "low_sargassum":
		switch strings.ToLower(strings.TrimSpace(a.SargassumRisk)) {
		case "low", "none", "very low":
			return 9
		case "moderate", "medium":
			return 6
		case "high", "very high":
			return 3
		default:
			return 5
		}
	}
	return 0
}

// ScoredArea is an area plus its computed 0-100 match score and the raw
// per-dimension values that fed it.
type ScoredArea struct {
	Area  *Area              `json:"area"`
	Score float64            `json:"score"`
	Parts map[string]float64 `json:"parts"`
}

// ScoreAreas ranks areas by a weighted blend of dimensions. Empty weights mean
// "weight every dimension equally".
func ScoreAreas(areas []Area, weights map[string]float64) []ScoredArea {
	weights = defaultWeights(weights, areaDimensions)
	total := sumPositive(weights)
	out := make([]ScoredArea, 0, len(areas))
	for i := range areas {
		a := &areas[i]
		parts := map[string]float64{}
		var sum float64
		for dim, w := range weights {
			if w <= 0 {
				continue
			}
			v := areaDimValue(a, dim)
			parts[dim] = v
			sum += w * v
		}
		out = append(out, ScoredArea{Area: a, Score: round1(sum / total * 10), Parts: parts})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}

// ── Hotel scoring ─────────────────────────────────────────────────────────────

var hotelDimensions = []string{
	"rating", "value", "luxury", "family", "romance", "beach", "activities",
}

func (s *Store) hotelDimValue(h *Hotel, dim string) float64 {
	switch dim {
	case "rating":
		return clampScore(h.GuestRating)
	case "value":
		if s.norm.maxRPD <= s.norm.minRPD || h.PricePerNightUSD <= 0 {
			return 5
		}
		rpd := h.GuestRating / h.PricePerNightUSD
		return clamp01((rpd-s.norm.minRPD)/(s.norm.maxRPD-s.norm.minRPD)) * 10
	case "luxury":
		starPart := clamp01((h.Stars - 3) / 2) // 3*->0, 5*->1
		var pricePart float64
		if s.norm.maxPrice > s.norm.minPrice {
			pricePart = clamp01((h.PricePerNightUSD - s.norm.minPrice) / (s.norm.maxPrice - s.norm.minPrice))
		}
		return clamp01(0.6*starPart+0.4*pricePart) * 10
	case "family":
		v := 2.0
		if h.FamilyFriendly {
			v = 7
		}
		if h.AdultsOnly {
			return 0
		}
		v += amenityBonus(h, []string{"kid", "water park", "waterpark", "family"})
		return clampScore(v)
	case "romance":
		v := 4.0
		if h.AdultsOnly {
			v = 9
		}
		v += amenityBonus(h, []string{"spa", "swim-up", "adults", "couple"})
		return clampScore(v)
	case "beach":
		v := 4.0
		if h.Beachfront {
			v = 8
		}
		if a := s.areaByID[h.AreaID]; a != nil {
			v = 0.6*v + 0.4*a.Scores.Beach
		}
		return clampScore(v)
	case "activities":
		v := float64(len(h.Amenities)) * 0.8
		v += amenityBonus(h, []string{"casino", "golf", "dive", "nightclub", "water park", "excursion", "watersport"})
		return clampScore(v)
	}
	return 0
}

// ScoredHotel is a hotel plus its computed 0-100 match score.
type ScoredHotel struct {
	Hotel *Hotel             `json:"hotel"`
	Score float64            `json:"score"`
	Parts map[string]float64 `json:"parts"`
}

// ScoreHotels ranks the given hotels by a weighted blend of feature scores.
func (s *Store) ScoreHotels(hotels []*Hotel, weights map[string]float64) []ScoredHotel {
	weights = defaultWeights(weights, hotelDimensions)
	total := sumPositive(weights)
	out := make([]ScoredHotel, 0, len(hotels))
	for _, h := range hotels {
		parts := map[string]float64{}
		var sum float64
		for dim, w := range weights {
			if w <= 0 {
				continue
			}
			v := s.hotelDimValue(h, dim)
			parts[dim] = round1(v)
			sum += w * v
		}
		out = append(out, ScoredHotel{Hotel: h, Score: round1(sum / total * 10), Parts: parts})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}

// ── helpers ───────────────────────────────────────────────────────────────────

func defaultWeights(w map[string]float64, dims []string) map[string]float64 {
	if len(w) > 0 {
		return w
	}
	out := make(map[string]float64, len(dims))
	for _, d := range dims {
		out[d] = 1
	}
	return out
}

func sumPositive(w map[string]float64) float64 {
	var total float64
	for _, v := range w {
		if v > 0 {
			total += v
		}
	}
	if total == 0 {
		return 1
	}
	return total
}

func amenityBonus(h *Hotel, keys []string) float64 {
	var b float64
	for _, am := range h.Amenities {
		la := strings.ToLower(am)
		for _, k := range keys {
			if strings.Contains(la, k) {
				b++
				break
			}
		}
	}
	if b > 3 {
		b = 3
	}
	return b
}

func clampScore(v float64) float64 { return clamp(v, 0, 10) }
func clamp01(v float64) float64    { return clamp(v, 0, 1) }

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
