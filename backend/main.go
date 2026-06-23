package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	dataPath := os.Getenv("DATA_PATH")
	if dataPath == "" {
		dataPath = "/data/seed.json"
	}

	store, err := LoadStore(dataPath)
	if err != nil {
		log.Printf("could not load %s (%v) — falling back to embedded seed", dataPath, err)
		store, err = LoadStoreFromBytes(embeddedSeed)
		if err != nil {
			log.Fatalf("failed to load embedded seed: %v", err)
		}
	}
	log.Printf("loaded %d areas, %d hotels (generated %s)",
		len(store.Data.Areas), len(store.Data.Hotels), store.Data.GeneratedAt)

	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	srv := &http.Server{
		Addr:         addr,
		Handler:      NewRouter(store),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	log.Printf("dr-api listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
