package main

// Image is a single self-hosted photo reference. After the image-fetch step,
// URL points at a local /images/... path served by the ximg `static` container
// (never an external URL, per stack rules). Source/credit/license are retained
// for attribution.
type Image struct {
	URL     string `json:"url"`
	Source  string `json:"source"`
	Credit  string `json:"credit,omitempty"`
	License string `json:"license"`
	Alt     string `json:"alt"`
}

// Scores holds 1-10 lifestyle ratings for an area.
type Scores struct {
	Beach       float64 `json:"beach"`
	Nightlife   float64 `json:"nightlife"`
	Family      float64 `json:"family"`
	Value       float64 `json:"value"`
	Nature      float64 `json:"nature"`
	Culture     float64 `json:"culture"`
	Safety      float64 `json:"safety"`
	Walkability float64 `json:"walkability"`
}

// Area is a Dominican Republic region travellers compare against each other.
// All numeric fields are float64 so the dataset loads cleanly whether the
// source emits integers or decimals.
type Area struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Region             string   `json:"region"`
	NearestAirport     string   `json:"nearest_airport"`
	AirportTransferMin float64  `json:"airport_transfer_min"`
	Summary            string   `json:"summary"`
	Description        string   `json:"description"`
	Vibe               string   `json:"vibe"`
	BestFor            []string `json:"best_for"`
	Scores             Scores   `json:"scores"`
	SargassumRisk      string   `json:"sargassum_risk"`
	AvgHotelPriceUSD   float64  `json:"avg_hotel_price_usd"`
	WhaleSeason        string   `json:"whale_season,omitempty"`
	EnglishPrevalence  string   `json:"english_prevalence"`
	BestMonths         []string `json:"best_months"`
	Lat                float64  `json:"lat"`
	Lng                float64  `json:"lng"`
	Highlights         []string `json:"highlights"`
	Pros               []string `json:"pros"`
	Cons               []string `json:"cons"`
	Images             []Image  `json:"images"`
}

// Hotel is a single property within an Area.
type Hotel struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	AreaID             string   `json:"area_id"`
	Brand              string   `json:"brand"`
	Stars              float64  `json:"stars"`
	GuestRating        float64  `json:"guest_rating"`
	PricePerNightUSD   float64  `json:"price_per_night_usd"`
	Board              string   `json:"board"`
	AdultsOnly         bool     `json:"adults_only"`
	FamilyFriendly     bool     `json:"family_friendly"`
	Beachfront         bool     `json:"beachfront"`
	NumRestaurants     float64  `json:"num_restaurants,omitempty"`
	NumPools           float64  `json:"num_pools,omitempty"`
	NumRooms           float64  `json:"num_rooms,omitempty"`
	Amenities          []string `json:"amenities"`
	NearestAirport     string   `json:"nearest_airport"`
	AirportTransferMin float64  `json:"airport_transfer_min"`
	Lat                float64  `json:"lat"`
	Lng                float64  `json:"lng"`
	OfficialSite       string   `json:"official_site,omitempty"`
	Summary            string   `json:"summary"`
	Description        string   `json:"description"`
	Pros               []string `json:"pros"`
	Cons               []string `json:"cons"`
	Images             []Image  `json:"images"`
}

// Dataset is the full seed payload (areas + hotels).
type Dataset struct {
	SchemaVersion int     `json:"schemaVersion"`
	GeneratedAt   string  `json:"generatedAt"`
	Areas         []Area  `json:"areas"`
	Hotels        []Hotel `json:"hotels"`
}
