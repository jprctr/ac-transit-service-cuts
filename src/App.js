import React, { useState, useEffect } from 'react';
import { scaleOrdinal } from 'd3-scale';
import sortBy from 'lodash.sortby';
import Autosuggest from 'react-autosuggest';
import useDimensions from 'react-use-dimensions';

import TransitMap, { rename } from './TransitMap'
import serviceChanges from './TransitMap/ac-transit-service-cuts.json';

import './App.css';

const typesInOrder = ['other', 'increased', 'no change', 'modified', 'reduced', 'eliminated'];

const colorScale = scaleOrdinal()
  .domain(typesInOrder)
  .range(['#a8aaac', '#008e9b', '#10684e', '#ffc75f', '#ff9671', '#CC0000']);

const orderScale = scaleOrdinal()
  .domain(typesInOrder)
  .range([1, 2, 3, 4, 5, 6]);

const changeType = 'change-30';
const routes = sortBy(
  sortBy(
    serviceChanges.map(route => {
      route.route = rename[route.line] || route.line;
      route.scaleKey = route[changeType].trim();
      route.scaleKey = route.scaleKey === '' ? 'no change' : route.scaleKey;
      route.color = colorScale(route.scaleKey);
      route.order = orderScale(route.scaleKey);
      return route;
    }).filter(change => change.line !== '40-duplicate')
  ,r => isNaN(parseInt(r.route)) ? r.route : parseInt(r.route))
,r => -r.order);

const getSuggestions = (value, visibleGroups) => {
  const inputValue = value.trim().toLowerCase();
  const inputLength = inputValue.length;
  return inputLength === 0 ? routes : routes.filter(route => route.route.toLowerCase().includes(inputValue));
};

const getSuggestionValue = suggestion => suggestion.route;

function App() {
  const [value, setValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [suggestions, setSuggestions] = useState(routes);
  const [visibleGroups, setVisibleGroups] = useState(typesInOrder);
  const [ref, { width }] = useDimensions();

  useEffect(() => {
    setValue(searchValue);
    setSuggestions(getSuggestions(searchValue, visibleGroups));
  }, [searchValue, visibleGroups]);

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

  const renderSuggestion = (suggestion) => {
    const isSelected = suggestion.route === value;
    return (
      <div
        className={`suggestion ${isSelected ? 'selected' : ''}`}
        data-route={suggestion.route}
        style={{ borderColor: suggestion.color }}
      >
        <div className='label'>
          {suggestion.route}
        </div>
        <div className='status'>
          {suggestion.scaleKey}
        </div>
      </div>
    );
  };

  return (
    <div ref={ref} className="App">
      <div className='panel'>
        <div className='headings'>
          <div className='title'>
            Proposed AC Transit Service Cuts 
          </div>
          <div className='subtitle'>
            Fall 2020 (30% Scenario)
          </div>
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
                {t}
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
              setValue(route);
            }
          }}
        >
          <Autosuggest
            alwaysRenderSuggestions={width > 768}
            suggestions={suggestions.filter(route => visibleGroups.includes(route.scaleKey))}
            onSuggestionsFetchRequested={({ value }) => setSuggestions(getSuggestions(value, visibleGroups))}
            onSuggestionsClearRequested={() => {}}
            getSuggestionValue={getSuggestionValue}
            renderSuggestion={suggestion => renderSuggestion(suggestion)}
            shouldRenderSuggestions={() => true}
            inputProps={{
              placeholder: 'Search',
              value,
              onChange: (e, { newValue }) => setValue(newValue),
            }}
          />
        </div>
      </div>
      <TransitMap
        changeType={changeType}
        selected={value}
        visibleGroups={visibleGroups}
        colorScale={colorScale}
        orderScale={orderScale}
        setSearchValue={setSearchValue}
      />
    </div>
  );
}

export default App;
