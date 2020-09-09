import React, { useState } from 'react';
import { scaleOrdinal } from 'd3-scale';

import TransitMap from './TransitMap'

import './App.css';

const typesInOrder = ['other', 'increased', '', 'modified', 'reduced', 'eliminated'];

const colorScale = scaleOrdinal()
  .domain(typesInOrder)
  .range(['#a8aaac', '#008e9b', '#10684e', '#ffc75f', '#ff9671', '#CC0000']);

const orderScale = scaleOrdinal()
  .domain(typesInOrder)
  .range([1, 2, 3, 4, 5, 6]);

const dashScale = scaleOrdinal()
  .domain(typesInOrder)
  .range([0, 0, 0, 1, 2, 3]);

function App() {
  const [visibleGroups, setVisibleGroups] = useState(typesInOrder);

  function updateGroups(id) {
    setVisibleGroups(groups => {
      if (groups.includes(id)) {
        const nextGroups = groups.slice().filter(group => group !== id);
        return nextGroups.length ? nextGroups : [];
      } else {
        return groups.concat([id]);
      }
    });
  }

  const visibleClassString = visibleGroups.map(g => g === '' ? 'nochange' : g).join(' ');

  return (
    <div className="App">
      <div className='panel'>
        <div className='title'>
          Proposed AC Transit Service Cuts 
        </div>
        <div className='subtitle'>
          Fall 2020 (30% Scenario)
        </div>
        <div className='legend'>
          {typesInOrder.filter(t => t !== 'other').reverse().map(t => (
            <div
              key={t}
              className='item'
              onClick={() => updateGroups(t)}
              style={{ opacity: visibleGroups.includes(t) ? 1 : 0.25 }}
            >
              <div className='swatch' style={{ background: colorScale(t) }}/>
              <div className='label'>
                {t === '' ? 'no change' : t}
              </div>
            </div>
          ))}
        </div>
      </div>
      <TransitMap
        visibleClassString={visibleClassString}
        colorScale={colorScale}
        orderScale={orderScale}
        dashScale={dashScale}
      />
    </div>
  );
}

export default App;
