import React, { useState, useEffect, useMemo } from 'react';
import { feature } from 'topojson';
import sortBy from 'lodash.sortby';
import { scaleLinear } from 'd3-scale';
import { geoPath, geoMercator } from 'd3-geo';
import { radial } from 'd3-fisheye';
import useDimensions from 'react-use-dimensions';
import { MapInteractionCSS } from 'react-map-interaction';

import './styles.css';

// Fall20Routeshape // Missing eliminated routes
// Summer19Routeshape
import Winter19Routeshape from './Winter19Routeshape.json';
import CombinedWinter19Routeshape from './CombinedWinter19Routeshape.json';
import serviceChanges from './ac-transit-service-cuts.json';

const thirtyThree = radial()
  .radius(2.5)
  .distortion(1.5)
  .smoothingRatio(0.75);

const fourtySix = radial()
  .radius(2.5)
  .distortion(1.5)
  .smoothingRatio(0.75);

const jay = radial()
  .radius(2.5)
  .distortion(1.5)
  .smoothingRatio(0.25);

const fisheye = coordinate => fourtySix(thirtyThree(jay(coordinate)));

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

const unused = [];
const combinedRoutes = feature(CombinedWinter19Routeshape, CombinedWinter19Routeshape.objects['1']);
const acTransitRoutes = feature(Winter19Routeshape,  Winter19Routeshape.objects.Winter19Routeshape);
acTransitRoutes.features = acTransitRoutes.features.map(f => {
  f.route = f.properties.PUB_RTE;
  f.changes = serviceChanges.find(r => r.line === f.route);
  if (!f.changes) {
    unused.push(f.route);
  }
  return f;
})
.filter(f => f.changes); // hiding no change info routes for now
console.warn(`no change information for: ${unused.join(', ')}`);

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

export default function TransitMap(props) {
  const { selected, visibleClassString, colorScale, orderScale, dashScale, onMouseOver } = props;
  const [tooltipData, setTooltipData] = useState();
  const [ref, { x, y, width, height }] = useDimensions();

  const { projection, path, translate, scale } = useMemo(() => (
    width
      ? scaleProjection(acTransitRoutes, width, height)
      : { translate: [0, 0], scale: 0 }
  ), [width, height]);

  const changeType = 'change-30';

  const routeBackground = useMemo(() => path ? (
    <path
      key='routeBackground'
      id='routeBackground'
      d={path(combinedRoutes)}
      stroke='#121212'
      fill='none'
    />
  ) : null, [path]);

  const routes = useMemo(() => {
    offsetGroups.forEach(g => {
      g.index = g.initIndex;
    });

    if (projection) {
      thirtyThree.focus(projection([ -122.25074308326039, 37.79930415428206 ]));
      fourtySix.focus(projection([ -122.19203753859007, 37.74994737608997 ]));
      jay.focus(projection([ -122.39272304308822, 37.7851476342889 ]));
    }

    const labelPositions = [];
    return width ? (
      sortBy(
        sortBy(
          acTransitRoutes.features.map(f => {
            f.scaleKey = f.changes ? f.changes[changeType].trim() : 'other';
            f.color = colorScale(f.scaleKey);
            f.order = orderScale(f.scaleKey);
            f.dash = dashScale(f.scaleKey);
            f.path = path(f);
            f.center = getCenter(path, f);
            return f;
          })
        , f => -f.route)
      , f => f.order)
      .map((f, i) => {
        const offsets = offsetGroups.filter(group => group.routes.includes(f.route));
        if (offsets[0]) {
          const offset = offsets[0];
          f.offsetType = offset.name;
          f.offset = {
            x: offset.direction[0] * offset.index,
            y: offset.direction[1] * offset.index,
          };
          offset.index++;
        } else {
          f.offsetType = 'default';
          f.offset = {
            x: 0,
            y: 0,
          };
        }

        const size = 0.18; // 0.19; //0.2; // 0.25;
        const flatCoordinates = flatDeep(f.geometry.coordinates.slice(), Infinity);
        f.start = fisheye(projection(flatCoordinates.slice(0, 2)));
        // f.start = projection(flatCoordinates.slice(-2));
        f.start[0] += f.offset.x / scale;
        f.start[1] += f.offset.y / scale;
        let position = f.start;
        let usedPositon = labelPositions.find(lp => overlapping(lp, {
          x1: position[0] - size,
          y1: position[1],
          x2: position[0] + size,
          y2: position[1] + size,
        }));

        if (manualOffsets[f.route]) {
          position[0] += manualOffsets[f.route].x;
          position[1] += manualOffsets[f.route].y;
          // usedPositon = false;
        }
        
        while (usedPositon) {
          flatCoordinates.splice(0, 2);
          let pos = f.start;
          if (flatCoordinates.length >= 2) {
            pos = fisheye(projection(flatCoordinates.slice(0, 2)));
            pos[0] += f.offset.x / scale;
            pos[1] += f.offset.y / scale;
            usedPositon = labelPositions.find(lp => overlapping(lp, {
              x1: pos[0] - size,
              y1: pos[1],
              x2: pos[0] + size,
              y2: pos[1] + size,
            }));
          } else {
            console.log(`default: ${f.route}`);
            usedPositon = false;
          }
          position = pos;
          if (manualOffsets[f.route]) {
            position[0] += manualOffsets[f.route].x / scale;
            position[1] += manualOffsets[f.route].y / scale;
            // usedPositon = false;
          }
        }

        labelPositions.push({
          x1: position[0] - size,
          y1: position[1],
          x2: position[0] + size,
          y2: position[1] + size,
        });

        f.labelPos = { x: position[0], y: position[1] };

        return f;
      })
    ) : [];
  }, [width, path, colorScale, orderScale, dashScale, projection, scale]);

  function updateTooltip(datum) {
    const { route, scaleKey, color, path, order, changes } = datum;
    const status = scaleKey === '' ? 'no change' : scaleKey;
    const { area, group, description } = changes;
    setTooltipData({
      route,
      color,
      path,
      order,
      area,
      group,
      description,
      status,
    });
  }

  useEffect(() => {
    const datum = routes.find(r => r.route === selected);
    if (datum) {
      updateTooltip(datum);
    } else {
      setTooltipData(null);
    }
  }, [selected, routes, x, y ]);

  function hoverLine(e) {
    const { target } = e;
    const { dataset } = target;
    const { route } = dataset;
    const datum = routes.find(r => r.route === route);
    if (datum) {
      if (!tooltipData || tooltipData.route !== route) {
        updateTooltip(datum);
      }
    }
  }

  const displayRoutes = useMemo(() => (
    routes.map((r, i) => (
      <g
        key={r.route}
        id={r.route}
        transform={`translate(${r.offset.x / scale}, ${r.offset.y / scale})`}
        className={`route ${r.scaleKey === '' ? 'nochange' : r.scaleKey}`}
      >
        <path
          className='visible'
          d={r.path}
          stroke={r.color}
          fill='none'
          strokeWidth={1.5 / scale}
          strokeOpacity={0.5}
          pointerEvents='none'
        />
        <path
          data-route={r.route}
          className='highlight'
          d={r.path}
          stroke={r.color}
          fill='none'
          strokeWidth={3 / scale}
          strokeOpacity='0'
        />
      </g>
    ))
  ), [routes, scale]);

  const displayLabels = useMemo(() => {
    const fontScale = scaleLinear()
    .domain([480, 1440])
    // .domain([480, 960])
    // .range([6, 18])
    // .range([7, 12])
    .range([7, 14])
    .clamp(true);
    const font = Math.floor(fontScale(Math.min(width, height))) || 9;
    const size = font / 3 * 4;
    return routes.map((r, i) => (
      <g
        pointerEvents='none'
        className={`${r.scaleKey === '' ? 'nochange' : r.scaleKey}`}
        key={`${r.route}-label`}
      >
        <g transform={`translate(${r.labelPos.x}, ${r.labelPos.y})`}>
          <rect
            data-route={r.route}
            className='target'
            x={-size / scale}
            width={size * 2 / scale}
            height={size / scale}
            fill='#121212'
            stroke={r.color}
            strokeWidth={1 / scale}
            fillOpacity={0.75}
            cursor='pointer'
          />
          <text
            fill='white'
            dy={font / scale}
            fontSize={font / scale}
            textAnchor='middle'
            pointerEvents='none'
          >
            {r.route === '1' ? '1BRT' : r.route}
          </text>
        </g>
      </g>
    ))
  }, [routes, width, height, scale]);

  return (
    <div ref={ref} className="TransitMap" onMouseOver={onMouseOver}>
      <MapInteractionCSS
        minScale={1}
        maxScale={10}
        showControls={true}
        controlsClass='controls'
        btnClass='control'
      >
        <svg className={visibleClassString} width={width} height={height}>
          <rect
            width={width}
            height={height}
            fill='transparent'
            onClick={() => tooltipData ? setTooltipData(null) : {}}
            onTouchStart={() => tooltipData ? setTooltipData(null) : {}}
            onMouseOver={() => tooltipData ? setTooltipData(null) : {}}
          />
          <g transform={`translate(${translate}) scale(${scale})`}>
            <g onMouseMove={hoverLine} onTouchStart={hoverLine}>
              {routeBackground}
              <g className='routes'>
                {displayRoutes}
              </g>
              <g className='labels' style={{ opacity: tooltipData ? 0.1 : 1 }}>
                {displayLabels}
              </g>
            </g>
            {tooltipData ? (
              <g
                key={`${tooltipData.route}-highlight`}
                id={`${tooltipData.route}-highlight`}
                pointerEvents='none'
              >
                <path
                  d={tooltipData.path}
                  stroke='white'
                  fill='none'
                  strokeWidth={6 / scale}
                  strokeOpacity='1'
                />
                <path
                  d={tooltipData.path}
                  stroke={tooltipData.color}
                  fill='none'
                  strokeWidth={3 / scale}
                  strokeOpacity='1'
                />
              </g>
            ) : null}
          </g>
        </svg>
      </MapInteractionCSS>
      {
        tooltipData ? (
          <div
            className='tooltip'
            style={{ borderColor: tooltipData.color }}
          >
            <div className='column left'>
              <div className='row'>
                <div className='route left'>
                  <span>
                    {tooltipData.route === '1' ? 'BRT (1)' : tooltipData.route}
                  </span>
                </div>
                <div className='area right'>
                  <span>
                    {tooltipData.area}
                  </span>
                </div>
              </div>
              <div className='row'>
                <div className='status left'>
                  <span>
                    {tooltipData.status === '' ? 'no change' : tooltipData.status}
                  </span>
                </div>
                <div className='group right'>
                  <span>
                    {tooltipData.group}
                  </span>
                </div>
              </div>
            </div>
            <div className='column right'>
              <div className={`row description ${tooltipData.description.length > 256 ? 'long' : 'short'}`}>
                <div>
                  <span>
                    {tooltipData.description}
                  </span>
                </div>
              </div>
            </div>
            <div
              className='close'
              style={{ borderColor: tooltipData.color }}
              onClick={() => setTooltipData(null)}
            >
              <div>x</div>
            </div>
          </div>
        ) : null
      }
    </div>
  );
}
