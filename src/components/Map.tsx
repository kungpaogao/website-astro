import L from "leaflet";
import {
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import { render } from "solid-js/web";
import type { Place } from "../lib/places";
import { format, set } from "date-fns";

interface MapProps {
  places: Place[];
}

/**
 * ideal behavior:
 * - click marker on mobile -> full screen map and show bottom sheet
 * - click marker on desktop -> show popup with nice ui
 */

const Popup: Component<{ place: Place }> = ({ place }) => {
  return (
    <div class="mb-[1px] rounded-sm bg-white p-3 drop-shadow-2xl">
      <p class="m-0 text-gray-500">This is a popup for {place.name}.</p>
    </div>
  );
};

const Map: Component<MapProps> = ({ places }) => {
  const [map, setMap] = createSignal<L.Map | null>(null);
  const [selectedPlace, setSelectedPlace] = createSignal<Place | null>(null);
  const [viewport, setViewport] = createSignal(null);

  onMount(() => {
    // NYC coordinates to center map
    const latitude = 40.74900042010468;
    const longitude = -73.98575388499262;
    // max bounds for map
    const southWest = L.latLng(38, -79);
    const northEast = L.latLng(47, -68);
    const bounds = L.latLngBounds(southWest, northEast);
    // init leaflet
    const map = L.map("map", {
      maxBounds: bounds,
      maxZoom: 20,
      minZoom: 7,
    }).setView([latitude, longitude], 11);
    // set map tiles
    const googleStreetTiles =
      "http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
    const stadiaTiles =
      "https://tiles.stadiamaps.com/tiles/alidade_bright/{z}/{x}/{y}{r}.png";
    L.tileLayer(stadiaTiles, {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // set map events
    map.on("click", () => {
      onClickMap();
    });

    // add markers for each place
    places.forEach((place) => {
      const popupContainer = L.DomUtil.create("div", "solid-popup-container");
      const popup = L.popup({
        closeButton: false,
      }).setContent(popupContainer);

      // render solid component in popup
      render(() => <Popup place={place} />, popupContainer);

      L.marker([place.latitude, place.longitude], {
        // custom icons and shadows
        icon: L.icon({
          iconUrl: "assets/pin.png",
          iconSize: [25, 25],
          shadowUrl: "assets/pin-shadow.png",
          shadowSize: [27, 27],
          shadowAnchor: [13.5, 13],
        }),
      })
        .addTo(map)
        .on("click", () => {
          // custom click behavior
          onClickMarker(place);
        })
        .bindPopup(popup);
    });

    setMap(map);
  });

  function onClickMarker(place: Place) {
    setSelectedPlace(place);
    // if sheet is going to cover the marker, recenter the remaining map area around the selected place
  }

  function onClickMap() {
    setSelectedPlace(null);
  }

  onCleanup(() => {
    // remove map
    map()?.remove();
  });

  return (
    <div class="tailwind-leaflet relative isolate flex-1">
      <noscript>Unfortunately, you need JavaScript to see the map :^(</noscript>
      <div id="map" class="h-full w-full" />
      <Show when={selectedPlace()}>
        <Sheet place={selectedPlace} />
      </Show>
    </div>
  );
};

const Sheet: Component<{ place: () => Place }> = (props) => {
  return (
    <div class="prose absolute top-0 right-0 left-1/2 z-[1000] m-3 rounded-md bg-stone-100 px-5 pb-3 shadow-2xl">
      <h2>{props.place().name}</h2>
      <p>{props.place().address}</p>
      <Show when={props.place().notes}>
        <div class="h-2" role="separator" aria-orientation="vertical"></div>
        <p>
          Notes: <i>{props.place().notes}</i>
        </p>
      </Show>
      <p class="text-gray-400">
        Added on {format(new Date(props.place().timestampMs), "yyyy-MM-dd")}
      </p>
    </div>
  );
};

export default Map;
