import React, { useState, useEffect, useMemo
  // , useRef 
} from 'react';
import { feature } from 'topojson';
import sortBy from 'lodash.sortby';
import { group } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { geoPath, geoMercator, geoBounds, geoCentroid } from 'd3-geo';
import { radial } from 'd3-fisheye';
import useDimensions from 'react-use-dimensions';
// import { MapInteractionCSS } from 'react-map-interaction';
// import mapboxgl from 'mapbox-gl';
import bbox from '@turf/bbox';
import { StaticMap, NavigationControl, _MapContext as MapContext, } from 'react-map-gl';
import { fitBounds } from 'viewport-mercator-project';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, TextLayer } from '@deck.gl/layers';
// import {DataFilterExtension} from '@deck.gl/extensions';

import './styles.css';

// Fall20Routeshape // Missing eliminated routes
// Summer19Routeshape
import Winter19Routeshape from './Winter19Routeshape.geo.json';
// import Winter19Routeshape from './Winter19Routeshape.json';
import RouteBackground from './RouteBackground.json';
import serviceChangeData from './ac-transit-service-cuts.json';

//
console.log(process.env.REACT_APP_MAPBOX_TOKEN);
// let maap;
// mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// const dataFilter = new DataFilterExtension({ filterSize: 1 });

const ashby = {
  focus: [-122.269361, 37.854422],
  distort: radial()
          .radius(2)
          .distortion(1.25)
          .smoothingRatio(0.25),
};

const fruitvale = {
  focus: [-122.224154, 37.774836],
  distort: radial()
          .radius(2)
          .distortion(1.25)
          .smoothingRatio(0.25),
};

function applyDistortion(coordinate) {
  return ashby.distort(fruitvale.distort(coordinate));
}



// not using for now
const offsetGroups = [
  // {
  //   name: 'transbay',
  //   routes: ['800', '707', '706', '703', '702', '701', 'E', 'Z', 'F', 'FS', 'G', 'CB', 'J', 'L', 'LA', 'NL', 'NX', 'NX1', 'NX2', 'NX4', 'P', 'V', 'W', 'B', 'C', 'H', 'NX3', 'NXC', 'O', 'OX', 'S', 'SB'],
  //   direction: [-2, 4],
  //   index: 0,
  //   initIndex: 0,
  // },
  // {
  //   name: 'sanpablo',
  //   routes: ['72', '72M', '72R', '802'],
  //   direction: [-4, 0],
  //   index: 4,
  //   initIndex: 4,
  // },
  // {
  //   name: '46',
  //   routes: ['46', '46L'],
  //   direction: [0, 4],
  //   index: 0,
  //   initIndex: 0,
  // },
];

const manualOffsets = {
  // 'B': { x: -0.25, y: -0.25 },
  // 'NX1': { x: -0.375, y: 0.125 },
  // 'NX3': { x: 0.5, y: 0 },
  // '14': { x: -0.375, y: -0.25 },
};

export const rename = {
  '1': 'BRT/1',
  // '1': 'BRT (1)',
};

const serviceChanges = serviceChangeData.map(change => {
  change.line = rename[change.line] || change.line;
  change['change-15'] = change['change-15'].trim() === '' ? 'no change' : change['change-15'];
  change['change-30'] = change['change-30'].trim() === '' ? 'no change' : change['change-30'];
  return change;
});
const noRouteFeatures = serviceChanges
  .filter(change => change.line.toLowerCase().includes('flex'))
  .map(change => ({
    route: change.line,
    changes: change,
    // geometry: {
    //   coordinates: [],
    //   type: "MultiLineString",
    // },
  }));

const unused = [];
const combinedRoutes = feature(RouteBackground, RouteBackground.objects['1']);
// const acTransitRoutes = feature(Winter19Routeshape,  Winter19Routeshape.objects.Winter19Routeshape);
const acTransitRoutes = Winter19Routeshape;
// console.log(acTransitRoutes)
acTransitRoutes.features = acTransitRoutes.features.map(f => {
  f.route = rename[f.properties.PUB_RTE] || f.properties.PUB_RTE;
  f.changes = serviceChanges.find(r => r.line === f.route);
  if (!f.changes) {
    unused.push(f.route);
  }
  return f;
})
.filter(f => f.changes); // hiding no info routes for now
acTransitRoutes.features = acTransitRoutes.features.concat(noRouteFeatures);

console.warn(`no information for: ${unused.join(', ')}`);

function getCenter(path, geometry) {
  const [x, y] = path.centroid(geometry);
  return { x, y };
};

function getBounds(path, geometry) {
  const bounds = path.bounds(geometry),
    dx = bounds[1][0] - bounds[0][0],
    y1 = bounds[0][1],
    dy = bounds[1][1] - y1,
    x = (bounds[0][0] + bounds[1][0]) / 2,
    y = (y1 + bounds[1][1]) / 2;
  return { dx, dy, x, y };
};

function scaleProjection(geometry, width, height) {
  const projection = geoMercator().scale(1000).rotate([-11, 0]).translate([width / 2, height / 2]);
  const path = geoPath().projection(projection);
  const target = geometry;
  const { dx, dy, x, y } = getBounds(path, target);
  const scale = 0.9 / Math.max(dx / width, dy / height) || 1,
    translate = [width / 2 - scale * x, height / 2 - scale * y];
  return { projection, path, scale, translate, x, y, dx, dy, };
};

// from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat
function flatDeep(arr, d = 1) {
  return d > 0
    ? arr.reduce((acc, val) => acc.concat(Array.isArray(val) ? flatDeep(val, d - 1) : val), [])
    : arr.slice();
};

function overlapping(box1, box2) {
  return box1.x2 >= box2.x1 && box1.x1 <= box2.x2 && box1.y1 <= box2.y2 && box1.y2 >= box2.y1;
}

function mapToNest(map) {
  return Array.from(map, ([key, values]) => ({key, values}));
}


function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

export default function TransitMap(props) {
  const { changeType, selected, visibleGroups, colorScale, orderScale, setSearchValue } = props;
  // const [mapSettings, setMapSettigns] = useState();
  // const [routes, setRoutes] = useState();
  // const [viewport, setViewport] = useState();
  const [tooltipData, setTooltipData] = useState();
  const [ref, { x, y, width, height }] = useDimensions();
  // const mapContainer = useRef();

  // console.log(mapContainer);
  // useEffect(() => {
  //   if (mapContainer.current) {
  //     const bounds = geoBounds(acTransitRoutes);
  //     console.log(bounds);
  //     const oakland = [-122.271168, 37.804323];
  //     map = new mapboxgl.Map({
  //       container: mapContainer.current,
  //       style: 'mapbox://styles/mapbox/dark-v10',
  //       center: oakland,
  //       zoom: 10,
  //     });
  //     map.fitBounds(bounds, { padding: 16 });

  //     // const scale = (512) * 0.5 / Math.PI * Math.pow(2, map.getZoom());
  //     // setMapSettigns({
  //     //   center: map.getCenter(),
  //     //   scale,
  //     // });
  //   }
  // }, [mapContainer]);
  // useEffect(() => {
  //   acTransitRoutes.features = sortBy(
  //     sortBy(
  //       acTransitRoutes.features.map(f => {
  //         f.scaleKey = f.changes ? f.changes[changeType].trim() : 'other';
  //         f.color = colorScale(f.scaleKey);
  //         f.order = orderScale(f.scaleKey);
  //         // f.path = path(f);
  //         // f.center = getCenter(path, f);
  //         return f;
  //       })
  //     , f => -f.route)
  //   , f => f.order);
  //   setRoutes(acTransitRoutes);
  // }, []);


  const routes = useMemo(() => {
    // offsetGroups.forEach(g => {
    //   g.index = g.initIndex;
    // });

    // if (projection) {
    //   ashby.distort.focus(projection(ashby.focus));
    //   fruitvale.distort.focus(projection(fruitvale.focus));
    // }
    // const size = 0.18;
    const size = 0.0075; // 0.0072; // min: 0.005;
    const rectHeight = size / 3 * 4;
    const labelPositions = [];
    // return width && path ? (
    return (
      sortBy(
        sortBy(
          acTransitRoutes.features.map(f => {
            f.scaleKey = f.changes ? f.changes[changeType].trim() : 'other';
            f.color = colorScale(f.scaleKey);
            f.order = orderScale(f.scaleKey);
            // f.path = path(f);
            // f.center = getCenter(path, f);
            // if (f.geometry) {
            //   // f.bounds = geoBounds(f);
            //   const rectWidth = Math.max(rectHeight, rectHeight / 2 * f.route.length);
            //   const flatCoordinates = flatDeep(f.geometry.coordinates.slice(), Infinity);
            //   //
            //   f.start = flatCoordinates.slice(0, 2);
            //   let position = f.start;
            //   let usedPositon = labelPositions.find(lp => overlapping(lp, {
            //     x1: position[0] - rectWidth / 2,
            //     y1: position[1],
            //     x2: position[0] + rectWidth / 2,
            //     y2: position[1] + rectHeight,
            //   }));

            //   while (usedPositon) {
            //     flatCoordinates.splice(0, 2);
            //     let pos = f.start;
            //     if (flatCoordinates.length >= 2) {
            //       pos = flatCoordinates.slice(0, 2);
            //       usedPositon = labelPositions.find(lp => overlapping(lp, {
            //         x1: pos[0] - rectWidth / 2,
            //         y1: pos[1],
            //         x2: pos[0] + rectWidth / 2,
            //         y2: pos[1] + rectHeight,
            //       }));
            //     } else {
            //       console.log(`default: ${f.route}`);
            //       usedPositon = false;
            //     }
            //     position = pos;
            //   }

            //   labelPositions.push({
            //     x1: position[0] - rectWidth / 2,
            //     y1: position[1],
            //     x2: position[0] + rectWidth / 2,
            //     y2: position[1] + rectHeight,
            //   });

            //   f.labelPos = position; // { x: position[0], y: position[1] };
            //   //
            // }

            return f;
          })
        , f => -f.route)
      , f => f.order)
      .map(f => {
          if (f.geometry) {
            // f.bounds = geoBounds(f);
            const rectWidth = Math.max(rectHeight, rectHeight / 2 * f.route.length);
            const flatCoordinates = flatDeep(f.geometry.coordinates.slice(), Infinity);
            //
            f.start = flatCoordinates.slice(0, 2);
            let position = f.start;
            let usedPositon = labelPositions.find(lp => overlapping(lp, {
              x1: position[0] - rectWidth / 2,
              y1: position[1],
              x2: position[0] + rectWidth / 2,
              y2: position[1] + rectHeight,
            }));

            while (usedPositon) {
              flatCoordinates.splice(0, 2);
              let pos = f.start;
              if (flatCoordinates.length >= 2) {
                pos = flatCoordinates.slice(0, 2);
                usedPositon = labelPositions.find(lp => overlapping(lp, {
                  x1: pos[0] - rectWidth / 2,
                  y1: pos[1],
                  x2: pos[0] + rectWidth / 2,
                  y2: pos[1] + rectHeight,
                }));
              } else {
                console.log(`default: ${f.route}`);
                usedPositon = false;
              }
              position = pos;
            }

            labelPositions.push({
              x1: position[0] - rectWidth / 2,
              y1: position[1],
              x2: position[0] + rectWidth / 2,
              y2: position[1] + rectHeight,
            });

            f.labelPos = position; // { x: position[0], y: position[1] };
            //
          }
          return f;
      })
    );
      // .map((f, i) => {
      //   const offsets = offsetGroups.filter(group => group.routes.includes(f.route));
      //   if (offsets[0]) {
      //     const offset = offsets[0];
      //     f.offsetType = offset.name;
      //     f.offset = {
      //       x: offset.direction[0] * offset.index,
      //       y: offset.direction[1] * offset.index,
      //     };
      //     offset.index++;
      //   } else {
      //     f.offsetType = 'default';
      //     f.offset = {
      //       x: 0,
      //       y: 0,
      //     };
      //   }

      //   if (f.geometry) {
      //     const size = 0.18; // 0.19; //0.2; // 0.25;
      //     // const size = 0.2;
      //     const rectHeight = size / 3 * 4;
      //     const rectWidth = Math.max(rectHeight, rectHeight / 2 * f.route.length);
          // const flatCoordinates = flatDeep(f.geometry.coordinates.slice(), Infinity);
      //     f.start = applyDistortion(projection(flatCoordinates.slice(0, 2)));
      //     // f.start = fisheye(projection(flatCoordinates.slice(0, 2)));
      //     // f.start = projection(flatCoordinates.slice(-2));
      //     f.start[0] += f.offset.x / scale;
      //     f.start[1] += f.offset.y / scale;
      //     let position = f.start;
      //     let usedPositon = labelPositions.find(lp => overlapping(lp, {
      //       // x1: position[0] - size,
      //       // y1: position[1],
      //       // x2: position[0] + size,
      //       // y2: position[1] + size,
      //       x1: position[0] - rectWidth / 2,
      //       y1: position[1],
      //       x2: position[0] + rectWidth / 2,
      //       y2: position[1] + rectHeight,
      //     }));

      //     if (manualOffsets[f.route]) {
      //       position[0] += manualOffsets[f.route].x;
      //       position[1] += manualOffsets[f.route].y;
      //       // usedPositon = false;
      //     }
          
      //     while (usedPositon) {
      //       flatCoordinates.splice(0, 2);
      //       let pos = f.start;
      //       if (flatCoordinates.length >= 2) {
      //         pos = applyDistortion(projection(flatCoordinates.slice(0, 2)));
      //         // pos = fisheye(projection(flatCoordinates.slice(0, 2)));
      //         pos[0] += f.offset.x / scale;
      //         pos[1] += f.offset.y / scale;
      //         usedPositon = labelPositions.find(lp => overlapping(lp, {
      //           // x1: pos[0] - size,
      //           // y1: pos[1],
      //           // x2: pos[0] + size,
      //           // y2: pos[1] + size,
      //           x1: pos[0] - rectWidth / 2,
      //           y1: pos[1],
      //           x2: pos[0] + rectWidth / 2,
      //           y2: pos[1] + rectHeight,
      //         }));
      //       } else {
      //         console.log(`default: ${f.route}`);
      //         usedPositon = false;
      //       }
      //       position = pos;
      //       if (manualOffsets[f.route]) {
      //         position[0] += manualOffsets[f.route].x / scale;
      //         position[1] += manualOffsets[f.route].y / scale;
      //         // usedPositon = false;
      //       }
      //     }

      //     labelPositions.push({
      //       // x1: position[0] - size,
      //       // y1: position[1],
      //       // x2: position[0] + size,
      //       // y2: position[1] + size,
      //       x1: position[0] - rectWidth / 2,
      //       y1: position[1],
      //       x2: position[0] + rectWidth / 2,
      //       y2: position[1] + rectHeight,
      //     });

      //     f.labelPos = { x: position[0], y: position[1] };
      //   }

      //   return f;
      // })
    // ) : [];
  }, [changeType, colorScale, orderScale]);

  const displayRoutes = useMemo(() => (
    routes.filter(route => visibleGroups.includes(route.scaleKey) && route.geometry)
  ), [routes, visibleGroups]);

  // const highlightRoute = useMemo(() => (selected ? routes.filter(feature => feature.route === selected) : []), [routes]);

  // console.log(routes);
  // }, [changeType, width, path, colorScale, orderScale, projection, scale]);


  // const { projection, path, translate, scale } = useMemo(() => {
  //     const transform = { translate: [0, 0], scale: 1 };
  //     if (width && height && mapSettings) {
  //       console.log(mapSettings);
  //       const { center, scale } = mapSettings;
  //       const projection = geoMercator()
  //         .center([center.lng, center.lat])
  //         .translate([width / 2, height / 2])
  //         .scale(scale);
  //       const path = geoPath().projection(projection);
  //       return {
  //         ...transform,
  //         projection,
  //         path,
  //       };
  //     }
  //     return transform;
  // }, [width, height, mapSettings]);

  // const { projection, path, translate, scale } = useMemo(() => (
  //   width
  //     ? scaleProjection(acTransitRoutes, width, height)
  //     : { translate: [0, 0], scale: 0 }
  // ), [width, height]);


  // const routeBackground = useMemo(() => path ? (
  //   <path
  //     key='routeBackground'
  //     id='routeBackground'
  //     d={path(combinedRoutes)}
  //     // stroke='#121212'
  //     stroke='transparent'
  //     // stroke='#333'
  //     strokeWidth='1.5'
  //     fill='none'
  //   />
  // ) : null, [path]);

  // const routes = useMemo(() => {
  //   offsetGroups.forEach(g => {
  //     g.index = g.initIndex;
  //   });

  //   if (projection) {
  //     ashby.distort.focus(projection(ashby.focus));
  //     fruitvale.distort.focus(projection(fruitvale.focus));
  //   }

  //   const labelPositions = [];
  //   return width && path ? (
  //     sortBy(
  //       sortBy(
  //         acTransitRoutes.features.map(f => {
  //           f.scaleKey = f.changes ? f.changes[changeType].trim() : 'other';
  //           f.color = colorScale(f.scaleKey);
  //           f.order = orderScale(f.scaleKey);
  //           f.path = path(f);
  //           f.center = getCenter(path, f);
  //           return f;
  //         })
  //       , f => -f.route)
  //     , f => f.order)
  //     .map((f, i) => {
  //       const offsets = offsetGroups.filter(group => group.routes.includes(f.route));
  //       if (offsets[0]) {
  //         const offset = offsets[0];
  //         f.offsetType = offset.name;
  //         f.offset = {
  //           x: offset.direction[0] * offset.index,
  //           y: offset.direction[1] * offset.index,
  //         };
  //         offset.index++;
  //       } else {
  //         f.offsetType = 'default';
  //         f.offset = {
  //           x: 0,
  //           y: 0,
  //         };
  //       }

  //       if (f.geometry) {
  //         const size = 0.18; // 0.19; //0.2; // 0.25;
  //         // const size = 0.2;
  //         const rectHeight = size / 3 * 4;
  //         const rectWidth = Math.max(rectHeight, rectHeight / 2 * f.route.length);
  //         const flatCoordinates = flatDeep(f.geometry.coordinates.slice(), Infinity);
  //         f.start = applyDistortion(projection(flatCoordinates.slice(0, 2)));
  //         // f.start = fisheye(projection(flatCoordinates.slice(0, 2)));
  //         // f.start = projection(flatCoordinates.slice(-2));
  //         f.start[0] += f.offset.x / scale;
  //         f.start[1] += f.offset.y / scale;
  //         let position = f.start;
  //         let usedPositon = labelPositions.find(lp => overlapping(lp, {
  //           // x1: position[0] - size,
  //           // y1: position[1],
  //           // x2: position[0] + size,
  //           // y2: position[1] + size,
  //           x1: position[0] - rectWidth / 2,
  //           y1: position[1],
  //           x2: position[0] + rectWidth / 2,
  //           y2: position[1] + rectHeight,
  //         }));

  //         if (manualOffsets[f.route]) {
  //           position[0] += manualOffsets[f.route].x;
  //           position[1] += manualOffsets[f.route].y;
  //           // usedPositon = false;
  //         }
          
  //         while (usedPositon) {
  //           flatCoordinates.splice(0, 2);
  //           let pos = f.start;
  //           if (flatCoordinates.length >= 2) {
  //             pos = applyDistortion(projection(flatCoordinates.slice(0, 2)));
  //             // pos = fisheye(projection(flatCoordinates.slice(0, 2)));
  //             pos[0] += f.offset.x / scale;
  //             pos[1] += f.offset.y / scale;
  //             usedPositon = labelPositions.find(lp => overlapping(lp, {
  //               // x1: pos[0] - size,
  //               // y1: pos[1],
  //               // x2: pos[0] + size,
  //               // y2: pos[1] + size,
  //               x1: pos[0] - rectWidth / 2,
  //               y1: pos[1],
  //               x2: pos[0] + rectWidth / 2,
  //               y2: pos[1] + rectHeight,
  //             }));
  //           } else {
  //             console.log(`default: ${f.route}`);
  //             usedPositon = false;
  //           }
  //           position = pos;
  //           if (manualOffsets[f.route]) {
  //             position[0] += manualOffsets[f.route].x / scale;
  //             position[1] += manualOffsets[f.route].y / scale;
  //             // usedPositon = false;
  //           }
  //         }

  //         labelPositions.push({
  //           // x1: position[0] - size,
  //           // y1: position[1],
  //           // x2: position[0] + size,
  //           // y2: position[1] + size,
  //           x1: position[0] - rectWidth / 2,
  //           y1: position[1],
  //           x2: position[0] + rectWidth / 2,
  //           y2: position[1] + rectHeight,
  //         });

  //         f.labelPos = { x: position[0], y: position[1] };
  //       }

  //       return f;
  //     })
  //   ) : [];
  // }, [changeType, width, path, colorScale, orderScale, projection, scale]);

  // const updateTooltip = useMemo(() => (
  //   function(datum) {
  //     const { route, scaleKey, color, path, order, changes } = datum;
  //     const status = scaleKey;
  //     const { area, group, description } = changes;
  //     setSearchValue(route);
  //     setTooltipData({
  //       route,
  //       color,
  //       path,
  //       order,
  //       area,
  //       group,
  //       description,
  //       status,
  //     });
  //   }
  // ), [setSearchValue]);

  const updateTooltip = useMemo(() => (
    function(datum, fromMap = false) {
      // const { route, scaleKey, color, path, order, changes } = datum;
      const { route, scaleKey, color, order, changes } = datum;
      const status = scaleKey;
      const { area, group, description } = changes;
      if (fromMap) {
        setSearchValue(route);
      }
      setTooltipData({
        route,
        color,
        // path,
        order,
        area,
        group,
        description,
        status,
        datum: datum.geometry ? datum : null,
      });
    }
  ), [setSearchValue]);

  useEffect(() => {
    const datum = routes.find(r => r.route === selected);
    if (datum) {
      updateTooltip(datum);
    } else {
      setTooltipData(null);
    }
  }, [updateTooltip, selected, routes, x, y ]);

  // function hoverLine(e) {
    // const { target } = e;
    // const { dataset } = target;
    // const { route } = dataset;
  // function hoverLine(route) {
  function hoverLine(target) {
    // console.log(object);
    const { object } = target;
    // let datumToUpdate = false;
    if (object) {
      const { route } = object;
      const datum = routes.filter(r => visibleGroups.includes(r.scaleKey)).find(r => r.route === route);
      if (datum) {
        if (!tooltipData || tooltipData.route !== route) {
          updateTooltip(datum, true);
          // return true;
          // datumToUpdate = datum;
        }
      }
    } else {
      if (selected !== '') {
        setSearchValue('');
      }
      if (tooltipData) {
        setTooltipData(null);  
      }
      
      

      // console.log(target);
      // setSeelec(null);
    }
    // return false;
    // if (datumToUpdate) {
    //   updateTooltip(datumToUpdate);
    // } else {
    //   setTooltipData(null);
    // }
  }

  // const displayRoutes = useMemo(() => (
  //   routes.map((r, i) => (
  //     <g
  //       key={r.route}
  //       id={r.route}
  //       transform={`translate(${r.offset.x / scale}, ${r.offset.y / scale})`}
  //       className={`route ${r.scaleKey}`}
  //     >
  //       <path
  //         data-route={r.route}
  //         className='highlight'
  //         d={r.path}
  //         stroke={r.color}
  //         fill='none'
  //         strokeWidth={1.5 / scale}
  //         strokeOpacity={0.5}
  //         pointerEvents='none'
  //       />
  //     </g>
  //   ))
  // ), [routes, scale]);

  // const displayLabels = useMemo(() => {
  //   const fontScale = scaleLinear()
  //   .domain([480, 1440])
  //   // .domain([480, 960])
  //   // .range([6, 18])
  //   // .range([7, 12])
  //   // .range([7, 14])
  //   .range([8, 18])
  //   // .range([9, 18])
  //   .clamp(true);
  //   const font = Math.floor(fontScale(Math.min(width, height))) || 9;
  //   const rectHeight = font / 3 * 4;
  //   return routes.filter(r => r.labelPos).map((r, i) => {
  //     const rectWidth = Math.max(rectHeight, rectHeight / 2 * r.route.length);
  //     return (
  //       <g
  //         pointerEvents='none'
  //         className={`${r.scaleKey}`}
  //         key={`${r.route}-label`}
  //       >
  //         <g transform={`translate(${r.labelPos.x}, ${r.labelPos.y})`}>
  //           <rect
  //             data-route={r.route}
  //             className='target'
  //             // x={-size / scale}
  //             // width={size * 2 / scale}
  //             // x={-size * 0.75 / scale}
  //             // width={size * 1.5 / scale}
  //             x={(-rectWidth / 2) / scale}
  //             width={rectWidth / scale}
  //             // x={(-size / 2) / scale}
  //             // width={size / scale}
  //             height={rectHeight / scale}
  //             fill='#121212'
  //             stroke={r.color}
  //             strokeWidth={1 / scale}
  //             // fillOpacity={0.75}
  //             fillOpacity={0.5}
  //             cursor='pointer'
  //           />
  //           <text
  //             fill='white'
  //             dy={(font - 0.5) / scale}
  //             fontSize={font / scale}
  //             textAnchor='middle'
  //             pointerEvents='none'
  //           >
  //             {r.route}
  //           </text>
  //         </g>
  //       </g>
  //     )
  //   })
  // }, [routes, width, height, scale]);
  // const groupLayers = useMemo(() => {
    // const layerMap = mapToNest(group(routes, route => route.scaleKey)).map(group => {   

  // const groupLayers = mapToNest(group(routes, route => route.scaleKey)).map(group => {      
  //   const color = hexToRgb(colorScale(group.key));
  //   const categoryVisible = visibleGroups.includes(group.key);
  //   const opacity = categoryVisible ? 255 : 0;
  //   const getLineColor = [...color, opacity];
  //   return new GeoJsonLayer({
  //     id: `${group.key}-routes`,
  //     data: group.values,
  //     stroked: true,
  //     filled: false,
  //     pickable: categoryVisible,
  //     lineWidthMinPixels: 1.5,
  //     lineWidthMaxPixels: 5,
  //     opacity: selected ? 0.001 : 1,
  //     getLineWidth: 10,
  //     getFillColor: [0, 0, 0, 255],
  //     getLineColor,
  //     onHover: hoverLine,
  //     parameters: {
  //       depthTest: false,
  //     },
  //     updateTriggers: {
  //       getLineColor: {visibleGroups},
  //     },
  //     // transitions: {
  //     //   getLineColor: 250,
  //     // },
  //   });
  // });

  const textLayers = mapToNest(group(displayRoutes, route => route.scaleKey)).map(group => {      
    return new TextLayer({
      id: `${group.key}-route-labels`,
      data: group.values,
      pickable: true,
      onHover: hoverLine,
      getText: route => route.route,
      getPosition: route => route.labelPos,
      // opacity: selected ? 0.001 : 1,
      opacity: selected ? 0.01 : 1,
      getColor: [0, 0, 0],
      backgroundColor: hexToRgb(colorScale(group.key)),
      sizeMinPixels: 0,
      sizeMaxPixels: 24,
      fontFamily: 'Fira Sans, sans-serif',
      fontWeight: 500,
      sizeUnits: 'meters',
      sizeScale: 32,
      // sizeScale: 24,
      // lineHeight: 0,
      // fontSettings: {
      //   sdf: true,
      // }
    });
  });

    // console.log(layerMap);
    // return layerMap;
    // console.log(Array.from(layerMap));

  // }, [routes]);
  // console.log(groupLayers);
  // const highlight
  //

  const layers = [
    new GeoJsonLayer({
      id: 'routes',
      // data: routes,
      data: displayRoutes,
      // data: routes.filter()
      stroked: true,
      filled: false,
      pickable: true,
      lineWidthMinPixels: 1.5,
      lineWidthMaxPixels: 5,
      opacity: selected ? 0.001 : 1,
      getLineWidth: 10,
      getFillColor: [0, 0, 0],
      // getLineColor: route => hexToRgb(colorScale(route.scaleKey)),
      getLineColor: route => {
        const color = hexToRgb(colorScale(route.scaleKey))
        return color;
        // const noSelectionOrSelected = !selected || route.route === selected;
        // const categoryVisible = visibleGroups.includes(route.scaleKey);
        // const opacity = categoryVisible
        //   // ? noSelectionOrSelected
        //     ? 255
        //     // : 10
        //   : 0;
        // const opacity = selected === '' ? 255 : 10;
        // // const opacity = 1;
        // return [...color, opacity];
      },
      onHover: hoverLine,
      parameters: {
        depthTest: false,
      },
      // updateTriggers: {
      //   getLineColor: {selected},
      // //   getFilterValue: {visibleGroups},
      // },
      // transitions: {
      //   getLineColor: 250,
      // },
      // filterSize: [0, 2],
      // getFilterValue: route => {
      //   // console.log(route.scaleKey);
      //   // console.log(visibleGroups);
      //   return visibleGroups.includes(route.scaleKey) ? -1 : 1;
      // },
      // extensions: [dataFilter],
    }),
    // ...groupLayers,
    
    new GeoJsonLayer({
      id: 'highlightRouteBackground',
      data: tooltipData && tooltipData.datum ? [tooltipData.datum] : [], // highlightRoute,
      stroked: true,
      filled: false,
      pickable: false,
      lineWidthMinPixels: 4,
      lineWidthMaxPixels: 15,
      // opacity: selected ? 1 : 0,
      getLineWidth: 10,
      getFillColor: [0, 0, 0, 255],
      getLineColor: [255, 255, 255], // route => hexToRgb(colorScale(route.scaleKey)),
      // onHover: hoverLine,
      parameters: {
        depthTest: false,
      },
      // transitions: {
      //   getLineColor: 250,
      // },
    }),
    new GeoJsonLayer({
      id: 'highlightRoute',
      data: tooltipData && tooltipData.datum ? [tooltipData.datum] : [], // highlightRoute,
      stroked: true,
      filled: false,
      pickable: false,
      lineWidthMinPixels: 2,
      lineWidthMaxPixels: 12,
      // opacity: selected ? 1 : 0,
      getLineWidth: 10,
      getFillColor: [0, 0, 0, 255],
      getLineColor: route => hexToRgb(colorScale(route.scaleKey)),
      // onHover: hoverLine,
      parameters: {
        depthTest: false,
      },
      // updateTriggers: {
      //   getLineColor: {visibleGroups},
      // },
      // transitions: {
      //   getLineColor: 250,
      // },
    }),
    ...textLayers,
    // new TextLayer({
    //   id: 'route-labels',
    //   data: displayRoutes,
    //   pickable: true,
    //   onHover: hoverLine,
    //   getText: route => route.route,
    //   // getPosition: route => geoCentroid(route),
    //   getPosition: route => route.labelPos,
    //   // getPosition: route => route.geometry.coordinates,
    //   // getColor: d => DEFAULT_COLOR,
    //   // getColor: route => hexToRgb(colorScale(route.scaleKey)),
    //   // getColor: route => !selected || route.route === selected ? [255, 255, 255] : [255, 255, 255, 10],
    //   opacity: selected ? 0.001 : 1,
    //   // getColor: route => hexToRgb(colorScale(route.scaleKey)),
    //   getColor: [255, 255, 255],
    //   // backgroundColor: [18, 18, 18],
    //   // backgroundColor: [255, 255, 255],
    //   // backgroundColor: route => hexToRgb(colorScale(route.scaleKey)),
    //   // opacity: 0.5,
    //   // getSize: 16,
    //   sizeMinPixels: 0,
    //   sizeMaxPixels: 24,
    //   fontFamily: 'Fira Sans, sans-serif',
    //   // font-family: 'Fira Sans', sans-serif;
    //   // getSize: () => 160,
    //   sizeUnits: 'meters',
    //   sizeScale: 38,
    //   // updateTriggers: {
    //   //   getColor: {selected},
    //   // },
    //   // sizeScale: fontSize / 20
    // }),
  ];

  const bounds = geoBounds(acTransitRoutes);
  const defaultViewState = fitBounds({
    width: width || 100,
    height: height || 100,
    padding: 16,
    bounds,
  });
  defaultViewState.bearing = 0;
  defaultViewState.pitch = 0;

  // console.log('render');s

  return (
    <div ref={ref} className="TransitMap">
      <DeckGL
        layers={layers}
        pickingRadius={8}
        initialViewState={defaultViewState}
        controller={true}
        getCursor={() => tooltipData ? 'pointer' : 'grab'}
        ContextProvider={MapContext.Provider}
      >    
        <StaticMap
          mapStyle="mapbox://styles/jprctr/ckf7hqkbl2caw19nw1abtzh3c"
          mapboxApiAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
          preventStyleDiffing={true}
          reuseMaps
        />
        <div className="navigationControl">
          <NavigationControl showCompass={false} />
        </div>
      </DeckGL>

      {
        // <MapInteractionCSS
        //   minScale={1}
        //   maxScale={10}
        //   showControls={true}
        //   controlsClass='controls'
        //   btnClass='control'
        // >
        // </MapInteractionCSS>
        // <div ref={mapContainer} className="mapbox" style={{ width, height }} />
      }
      {
        // <svg className={visibleClassString} width={width} height={height}>
        //   <rect
        //     width={width}
        //     height={height}
        //     fill='transparent'
        //     onClick={() => tooltipData ? setTooltipData(null) : {}}
        //     onTouchStart={() => tooltipData ? setTooltipData(null) : {}}
        //     onMouseOver={() => tooltipData ? setTooltipData(null) : {}}
        //   />
        //   <g transform={`translate(${translate}) scale(${scale})`}>
        //     <g onMouseMove={hoverLine} onTouchStart={hoverLine}>
        //       {routeBackground}
        //       <g className='routes'>
        //         {displayRoutes}
        //       </g>
        //       <g className={`labels ${tooltipData ? 'dim' : ''}`}>
        //         {displayLabels}
        //       </g>
        //     </g>
        //     {tooltipData ? (
        //       <g
        //         key={`${tooltipData.route}-highlight`}
        //         id={`${tooltipData.route}-highlight`}
        //         className='spotlight'
        //         pointerEvents='none'
        //       >
        //         <path
        //           d={tooltipData.path}
        //           stroke='white'
        //           fill='none'
        //           strokeWidth={6 / scale}
        //           strokeOpacity='1'
        //         />
        //         <path
        //           d={tooltipData.path}
        //           stroke={tooltipData.color}
        //           fill='none'
        //           strokeWidth={3 / scale}
        //           strokeOpacity='1'
        //         />
        //       </g>
        //     ) : null}
        //   </g>
        // </svg>
      }
      <div
        className='tooltip'
        style={{ borderColor: tooltipData ? tooltipData.color : 'white', opacity: tooltipData ? 1 : 0 }}
      >
        <div className='column left'>
          <div className='row'>
            <div className='route left'>
              <span>
                {tooltipData ? tooltipData.route : ''}
              </span>
            </div>
            <div className='area right'>
              <span>
                {tooltipData ? tooltipData.area : ''}
              </span>
            </div>
          </div>
          <div className='row'>
            <div className='status left'>
              <span>
                {tooltipData ? tooltipData.status : ''}
              </span>
            </div>
            <div className='group right'>
              <span>
                {tooltipData ? tooltipData.group : ''}
              </span>
            </div>
          </div>
        </div>
        <div className='column right'>
          <div className='row description'>
            <div>
              <span>
                {tooltipData ? tooltipData.description : ''}
              </span>
            </div>
          </div>
        </div>
        <div
          className='close'
          style={{ borderColor: tooltipData ? tooltipData.color : 'white' }}
          onClick={() => {
            if (selected !== '') {
              setSearchValue('');
            }
            setTooltipData(null);
          }}
        >
          <div>x</div>
        </div>
      </div>
    </div>
  );
}
