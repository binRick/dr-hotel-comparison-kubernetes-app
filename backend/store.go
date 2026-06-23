package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

// Store holds the loaded dataset plus lookup indexes and normalization stats
// used by the scoring engine.
type Store struct {
	Data         Dataset
	areaByID     map[string]*Area
	hotelByID    map[string]*Hotel
	hotelsByArea map[string][]*Hotel
	norm         hotelNorm
}

// hotelNorm captures min/max ranges so per-hotel feature scores can be
// normalized across the whole dataset (e.g. "value" = rating per dollar).
type hotelNorm struct {
	minPrice, maxPrice float64
	minRPD, maxRPD     float64 // guest rating per dollar
}

// LoadStore reads and indexes the dataset from a JSON file.
func LoadStore(path string) (*Store, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return LoadStoreFromBytes(b)
}

// LoadStoreFromBytes indexes a dataset from raw JSON bytes.
func LoadStoreFromBytes(b []byte) (*Store, error) {
	var ds Dataset
	if err := json.Unmarshal(b, &ds); err != nil {
		return nil, fmt.Errorf("parse seed: %w", err)
	}
	s := &Store{
		Data:         ds,
		areaByID:     map[string]*Area{},
		hotelByID:    map[string]*Hotel{},
		hotelsByArea: map[string][]*Hotel{},
	}
	for i := range s.Data.Areas {
		a := &s.Data.Areas[i]
		s.areaByID[a.ID] = a
	}
	s.norm = hotelNorm{minPrice: 1e18, maxPrice: 0, minRPD: 1e18, maxRPD: 0}
	for i := range s.Data.Hotels {
		h := &s.Data.Hotels[i]
		s.hotelByID[h.ID] = h
		s.hotelsByArea[h.AreaID] = append(s.hotelsByArea[h.AreaID], h)
		if h.PricePerNightUSD > 0 {
			if h.PricePerNightUSD < s.norm.minPrice {
				s.norm.minPrice = h.PricePerNightUSD
			}
			if h.PricePerNightUSD > s.norm.maxPrice {
				s.norm.maxPrice = h.PricePerNightUSD
			}
			rpd := h.GuestRating / h.PricePerNightUSD
			if rpd < s.norm.minRPD {
				s.norm.minRPD = rpd
			}
			if rpd > s.norm.maxRPD {
				s.norm.maxRPD = rpd
			}
		}
	}
	// List hotels within each area best-rated first.
	for k := range s.hotelsByArea {
		hs := s.hotelsByArea[k]
		sort.Slice(hs, func(i, j int) bool { return hs[i].GuestRating > hs[j].GuestRating })
	}
	return s, nil
}
