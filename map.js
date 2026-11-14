import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoiYzlob25nIiwiYSI6ImNtd2ZvcGFsNjA1M28zMHB4cG91bWNjbWoifQ.5JHQGLb76HU2X6pi_-yu_A';

const minutesPerDay = 24 * 60;
const departuresByMinute = Array.from({ length: minutesPerDay }, () => []);
const arrivalsByMinute = Array.from({ length: minutesPerDay }, () => []);

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

function getCoords(station) {
  const point = new mapboxgl.LngLat(Number(station.lon), Number(station.lat));
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

function formatTime(minutes) {
  const date = new Date(2000, 0, 1, 0, minutes);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat();
  }

  const filteredTrips = [];
  const normalizedMinute = minute % minutesPerDay;

  for (let offset = -60; offset <= 60; offset += 1) {
    const bucketMinute =
      (normalizedMinute + offset + minutesPerDay) % minutesPerDay;
    filteredTrips.push(...tripsByMinute[bucketMinute]);
  }

  return filteredTrips;
}

function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (trips) => trips.length,
    (trip) => trip.start_station_id,
  );
  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (trips) => trips.length,
    (trip) => trip.end_station_id,
  );

  return stations.map((station) => {
    const id = station.short_name;
    const stationArrivals = arrivals.get(id) ?? 0;
    const stationDepartures = departures.get(id) ?? 0;
    return {
      ...station,
      arrivals: stationArrivals,
      departures: stationDepartures,
      totalTraffic: stationArrivals + stationDepartures,
    };
  });
}

map.on('load', async () => {
  const svg = d3.select('#map').select('svg');
  const jsonurl = 'https://gbfs.bluebikes.com/gbfs/en/station_information.json';
  const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 3,
      'line-opacity': 0.6,
    },
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#178B3A',
      'line-width': 3,
      'line-opacity': 0.6,
    },
  });

  try {
    const [jsonData, trips] = await Promise.all([
      d3.json(jsonurl),
      d3.csv(csvurl, (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
      }),
    ]);
    console.log('Loaded JSON Data:', jsonData);

    trips.forEach((trip) => {
      const departureMinute = minutesSinceMidnight(trip.started_at);
      const arrivalMinute = minutesSinceMidnight(trip.ended_at);
      departuresByMinute[departureMinute].push(trip);
      arrivalsByMinute[arrivalMinute].push(trip);
    });

    const stations = jsonData.data.stations;
    const allTrafficStations = computeStationTraffic(stations);
    let displayedStations = allTrafficStations;
    console.log('Stations Array:', allTrafficStations);

    const radiusScale = d3
      .scaleSqrt()
      .domain([
        0,
        d3.max(allTrafficStations, (station) => station.totalTraffic) || 1,
      ])
      .range([0, 25]);
    const stationFlow = d3
      .scaleQuantize()
      .domain([0, 1])
      .range([0, 0.5, 1]);

    let circles;

    function updateScatterPlot(timeFilter) {
      displayedStations =
        timeFilter === -1
          ? allTrafficStations
          : computeStationTraffic(stations, timeFilter);
      radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]);

      circles = svg
        .selectAll('circle')
        .data(displayedStations, (station) => station.short_name)
        .join('circle')
        .attr('r', (station) => radiusScale(station.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .style('--departure-ratio', (station) =>
          station.totalTraffic === 0
            ? 0.5
            : stationFlow(station.departures / station.totalTraffic),
        );

      circles
        .selectAll('title')
        .data((station) => [station])
        .join('title')
        .text(
          (station) =>
            `${station.totalTraffic} trips (${station.departures} departures, ${station.arrivals} arrivals)`,
        );

      updatePositions();
    }

    function updatePositions() {
      circles
        .attr('cx', (station) => getCoords(station).cx)
        .attr('cy', (station) => getCoords(station).cy);
    }

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    function updateTimeDisplay() {
      const timeFilter = Number(timeSlider.value);

      if (timeFilter === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
      } else {
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.style.display = 'none';
      }

      updateScatterPlot(timeFilter);
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
  } catch (error) {
    console.error('Error loading station or trip data:', error);
  }
});
