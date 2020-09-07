import React from 'react';
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
  return (
    <div className="App">
      <div className='panel'>
        <div className='title'>
          Proposed AC Transit Service Cuts Fall 2020 (30% Scenario)
        </div>
        <div className='legend'>
          {typesInOrder.reverse().map(t => (
            <div key={t} className='item'>
              <div className='swatch' style={{ background: colorScale(t) }}/>
              <div className='label'>
                {t === '' ? 'no change' : t}
              </div>
            </div>
          ))}
        </div>
      </div>
      <TransitMap
        colorScale={colorScale}
        orderScale={orderScale}
        dashScale={dashScale}
      />
    </div>
  );
}

export default App;
