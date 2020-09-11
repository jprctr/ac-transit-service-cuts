import React, { useState, useEffect } from 'react';
import { scaleOrdinal } from 'd3-scale';
import sortBy from 'lodash.sortby';
import Autosuggest from 'react-autosuggest';
import useDimensions from 'react-use-dimensions';

import TransitMap from './TransitMap'
import serviceChanges from './TransitMap/ac-transit-service-cuts.json';

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

const changeType = 'change-30';
const routes = sortBy(
  sortBy(
    serviceChanges.map(route => {
      route.route = route.line;
      route.scaleKey = route[changeType].trim();
      route.color = colorScale(route.scaleKey);
      route.order = orderScale(route.scaleKey);
      return route;
    })
  ,r => isNaN(parseInt(r.route)) ? r.route : parseInt(r.route))
,r => -r.order);

const getSuggestions = value => {
  const inputValue = value.trim().toLowerCase();
  const inputLength = inputValue.length;
  return inputLength === 0 ? routes : routes.filter(route => route.route.toLowerCase().includes(inputValue));
};

const renderSuggestion = (suggestion, selected) => {
  const isSelected = suggestion.route === selected;
  return (
    <div
      className={`suggestion ${isSelected ? 'selected' : ''}`}
      data-route={suggestion.route}
    >
      <div
        className='suggestionBorder'
        style={{ borderColor: suggestion.color }}
      >
        <div className='label'>
          {suggestion.route}
        </div>
        {isSelected ? (
          <div className='status'>
            {suggestion.scaleKey === '' ? 'no change' : suggestion.scaleKey}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const getSuggestionValue = suggestion => suggestion.route;

function App() {
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState('');
  const [suggestions, setSuggestions] = useState(routes);
  const [visibleGroups, setVisibleGroups] = useState(typesInOrder);
  const [ref, { width }] = useDimensions();

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

  useEffect(() => {
    setSelected(value);
  }, [value]);

  const visibleClassString = visibleGroups.map(g => g === '' ? 'nochange' : g).join(' ');

  return (
    <div ref={ref} className="App">
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
        <div
          className='search'
          onMouseMove={e => {
            const { target } = e;
            const { dataset } = target;
            const { route } = dataset;
            if (route) {
              setSelected(route);
            }
          }}
        >
          <Autosuggest
            alwaysRenderSuggestions={width > 768}
            suggestions={suggestions}
            onSuggestionsFetchRequested={({ value }) => setSuggestions(getSuggestions(value))}
            onSuggestionsClearRequested={() => setSuggestions(routes)}
            getSuggestionValue={getSuggestionValue}
            renderSuggestion={suggestion => renderSuggestion(suggestion, selected)}
            inputProps={{
              placeholder: 'Search',
              value,
              onChange: (e, { newValue }) => setValue(newValue),
            }}
          />
        </div>
      </div>
      <TransitMap
        selected={selected}
        visibleClassString={visibleClassString}
        colorScale={colorScale}
        orderScale={orderScale}
        dashScale={dashScale}
        onMouseOver={() => setSelected('')}
      />
    </div>
  );
}

export default App;
