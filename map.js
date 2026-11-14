import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoiYzlob25nIiwiYSI6ImNtd2ZvcGFsNjA1M28zMHB4cG91bWNjbWoifQ.5JHQGLb76HU2X6pi_-yu_A';

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

map.on('load', async () => {
  const svg = d3.select('#map').select('svg');
  const jsonurl = 'https://gbfs.bluebikes.com/gbfs/en/station_information.json';

  try {
    const jsonData = await d3.json(jsonurl);
    console.log('Loaded JSON Data:', jsonData);

    const stations = jsonData.data.stations;
    console.log('Stations Array:', stations);

    const circles = svg
      .selectAll('circle')
      .data(stations)
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8);

    function updatePositions() {
      circles
        .attr('cx', (station) => getCoords(station).cx)
        .attr('cy', (station) => getCoords(station).cy);
    }

    updatePositions();
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);
  } catch (error) {
    console.error('Error loading JSON:', error);
  }

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
});
