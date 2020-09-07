import React, { useState, useMemo } from 'react';
import { feature } from 'topojson';
import { geoPath, geoMercator } from 'd3-geo';
import useDimensions from 'react-use-dimensions';
import { MapInteractionCSS } from 'react-map-interaction';

import './styles.css';

// Fall20Routeshape // Missing eliminated routes
// Summer19Routeshape
import Winter19Routeshape from './Winter19Routeshape.json';
import serviceChanges from './ac-transit-service-cuts.json';

const unused = [];
const acTransitRoutes = feature(Winter19Routeshape,  Winter19Routeshape.objects.Winter19Routeshape);
acTransitRoutes.features = acTransitRoutes.features.map(f => {
  f.route = f.properties.PUB_RTE;
  f.changes = serviceChanges.find(r => r.line === f.route);
  if (!f.changes) {
    unused.push(f.route);
  }
  return f;
})
// .filter(f => f.changes);
console.warn(`no change information for: ${unused.join(', ')}`)

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

export default function TransitMap(props) {
  const { colorScale, orderScale, dashScale } = props;
  const [tooltipData, setTooltipData] = useState();
  const [ref, { width, height }] = useDimensions();

  const { path, translate, scale } = useMemo(() => (
    width
      ? scaleProjection(acTransitRoutes, width, height)
      : { translate: [0, 0], scale: 0 }
  ), [width, height]);

  const changeType = 'change-30';
  
  const keys = [];
  const routes = useMemo(() => (
    width ? (
      acTransitRoutes.features.map(f => {
        f.scaleKey = f.changes ? f.changes[changeType].trim() : 'other';
        keys.push(f.scaleKey);
        f.color = colorScale(f.scaleKey);
        f.order = orderScale(f.scaleKey);
        f.dash = dashScale(f.scaleKey);
        f.path = path(f);
        f.center = getCenter(path, f);
        return f;
      })
      .sort((a, b) => b.order - a.order)
      .reverse()
    ) : []
  ), [width, keys, path, colorScale, orderScale, dashScale]);

  function hoverLine(e) {
    const { pageX, pageY, target } = e;
    const { dataset } = target;
    const { route, status, color, path } = dataset;
    if (route) {
      if (!tooltipData || tooltipData.route !== route) {
        setTooltipData({
          x: pageX,
          y: pageY,
          route,
          color,
          path,
          status: status === '' ? 'no change' : status,
        });
      }
    } else {
      if (tooltipData) {
        setTooltipData(null);
      }
    }
  }

  const displayRoutes = useMemo(() => (
    routes.map(r => (
      <g
        key={r.route}
        id={r.route}
        className='route'
      >
        <path
          className='visible'
          d={r.path}
          stroke={r.color}
          fill='none'
          strokeDasharray={`${r.dash / scale} ${r.dash * 2 / scale}`}
          strokeWidth={0.5 / scale}
          strokeOpacity={0.5}
        />
        <path
          className='highlight'
          d={r.path}
          stroke={r.color}
          fill='none'
          strokeWidth={3 / scale}
          strokeOpacity='0'
          data-route={r.route}
          data-status={r.scaleKey}
          data-color={r.color}
          data-path={r.path}
        />
      </g>
    ))
  ), [routes, scale]);

  return (
    <div ref={ref} className="TransitMap">
      <MapInteractionCSS
        minScale={1}
        maxScale={10}
        showControls={true}
        // controlsClass='controls'
        // btnClass='control'
      >
        <svg width={width} height={height}>
          <g transform={`translate(${translate}) scale(${scale})`}>
            <g onMouseMove={hoverLine} onTouchStart={hoverLine}>
              {displayRoutes}
            </g>
            {tooltipData ? (
              <g
                key={`${tooltipData.route}-highlight`}
                id={`${tooltipData.route}-highlight`}
                pointerEvents='none'
              >
                <path
                  d={tooltipData.path}
                  stroke={tooltipData.color}
                  fill='none'
                  strokeWidth={2 / scale}
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
            style={{ left: tooltipData.x, top: tooltipData.y }}
          >
            {`${tooltipData.route}: ${tooltipData.status === '' ? 'no change' : tooltipData.status}`}
          </div>
        ) : null
      }
    </div>
  );
}
