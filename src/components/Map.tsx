import L from "leaflet";
import { onMount, type Component } from "solid-js";
import type { Place } from "../lib/places";

interface MapProps {
  places: Place[];
}

const Map: Component<MapProps> = ({ places }) => {
  onMount(() => {
    console.log("Map component");
    // leaflet stuff
    const latitude = 40.74900042010468;
    const longitude = -73.98575388499262;
    const map = L.map("map").setView([latitude, longitude], 11);
    const googleStreetTiles =
      "http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
    const googleHybridTiles =
      "http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}";
    const osmTiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

    L.tileLayer(googleStreetTiles, {
      maxZoom: 19,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    places.forEach((place) => {
      L.marker([place.latitude, place.longitude])
        .addTo(map)
        .bindPopup(place.name);
    });
  });

  return (
    <div>
      <div id="map" class="h-[400px] w-full" />
    </div>
  );
};

export default Map;
