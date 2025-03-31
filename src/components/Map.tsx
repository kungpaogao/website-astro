import L from "leaflet";
import { onMount, type Component } from "solid-js";
import type { Place } from "../lib/places";

interface MapProps {
  places: Place[];
}

const Map: Component<MapProps> = ({ places }) => {
  onMount(() => {
    // NYC coordinates to center map
    const latitude = 40.74900042010468;
    const longitude = -73.98575388499262;
    // init leaflet
    const map = L.map("map").setView([latitude, longitude], 11);
    // set map tiles
    const googleStreetTiles =
      "http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
    L.tileLayer(googleStreetTiles, {
      maxZoom: 19,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // add markers for each place
    places.forEach((place) => {
      L.marker([place.latitude, place.longitude])
        .addTo(map)
        .bindPopup(place.name);
    });
  });

  return (
    <div class="flex-1">
      <noscript>Unfortunately, you need JavaScript to see the map :^(</noscript>
      <div id="map" class="h-full w-full" />
    </div>
  );
};

export default Map;
