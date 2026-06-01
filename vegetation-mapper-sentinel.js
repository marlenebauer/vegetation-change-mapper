//#############################################################################################################
//#                    LANDTRENDR CHANGE MAPPER — Sentinel-2 adaptation (2018–Present)                        #
//#-----------------------------------------------------------------------------------------------------------#
//#  Based on the LandTrendr (LT-GEE) algorithm and UI application developed by the eMapR lab.                #
//#  Original authors: Justin Braaten (Google), Zhiqiang Yang (USDA Forest Service),                          #
//#                    Robert Kennedy (Oregon State University); mod. Ben Roberts-Pierel (OSU).               #
//#  Original code:    https://github.com/eMapR/LT-GEE  (code samples licensed under Apache License 2.0)      #
//#  Documentation:    https://emapr.github.io/LT-GEE/landtrendr.html                                         #
//#  Citation: Kennedy, R.E., Yang, Z., Gorelick, N., Braaten, J., Cavalcante, L., Cohen, W.B.,               #
//#            Healey, S. (2018). Implementation of the LandTrendr Algorithm on Google Earth Engine.          #
//#            Remote Sensing, 10, 691.                                                                       #
//#                                                                                                           #
//#  MODIFICATIONS by Marlene Bauer (https://github.com/marlenebauer):                                        #
//#   - Replaced the Landsat input with Sentinel-2 SR (COPERNICUS/S2_SR_HARMONIZED, 10 m, 2018+).             #
//#   - Rewrote band selection/renaming and switched cloud/shadow masking to the SCL band.                    #
//#   - Added a vegetation-index dropdown, a point + buffer AOI selector, and an NDWI water mask.             #
//#   - Added a normalised "Magnitude %" layer and dynamic gradient legends.                                  #
//#                                                                                                           #
//#  This file has been modified from the original eMapR LT-GEE code samples.                                 #
//#  Distributed under the Apache License 2.0 (see LICENSE).                                                  #
//#############################################################################################################




//========================================================================================================
// 1. IMPORTS & GLOBAL VARIABLES
//========================================================================================================

// Import LandTrendr module
var ltgee = require('users/emaprlab/public:Modules/LandTrendr.js');

// Set up Map panel with custom options and cursor style
var map = ui.Map();
map.setCenter(55.4540, -4.6796, 9); // Center map at a sample location
map.style().set({cursor:'crosshair'});
map.setOptions('HYBRID'); // Use imagery + roads

// Legend containers (will be used to update/remove legends dynamically)
var magLegend = null;
var magPctLegend = null;

//========================================================================================================
// 2. UI ELEMENTS
//========================================================================================================


// Exported buffer input panel: Allows user to define buffer size around a point in kilometers
exports.bufferPanel = function(){
  var bufferSectionLabel = ui.Label('Define a Buffer Around Point (km)',{fontWeight: 'bold'});
  var bufferBoxLabel = ui.Label('Buffer:');
  var bufferBox = ui.Textbox({value: 3, style:{stretch: 'horizontal'}}); // Default is 3km
  return ui.Panel(
    [
      bufferSectionLabel,
      ui.Panel([bufferBoxLabel,bufferBox], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'})
    ]
  );
};

// Extract buffer size from bufferPanel widget
exports.getBuffer = function(bufferPanel){
  return bufferPanel.widgets().get(1).widgets().get(1).getValue();
};

// Exported index selection dropdown: Choose vegetation or spectral index for change analysis
// with NDVI as default
exports.indexPanel = function() {
  var indexLabel = ui.Label('Select Index', {fontWeight: 'bold'});
  var indexList = [
    'NBR', 'NDVI', 'EVI', 'NDMI', 'TCB', 'TCG', 'TCW',
    'B1', 'B2', 'B3', 'B4', 'B5', 'B7',
  ];
  var indexSelect = ui.Select({items: indexList, value: 'NDVI', style: {stretch: 'horizontal'}});
  return ui.Panel(
    [indexLabel, indexSelect], 
    null, 
    {stretch: 'horizontal'}
  );
};
// Function to get the selected index from your custom panel
exports.getIndexSelect = function(indexPanel) {
  return indexPanel.widgets().get(1).getValue();
};
// Submit button: Triggers change map updating and new LandTrendr runs
exports.submitButton = function(){
  return ui.Button({label: 'Submit', style:{stretch: 'horizontal'}});
};

//========================================================================================================
// 3. CORE PROCESSING FUNCTIONS
//========================================================================================================

//  functions to select and rename bands for Sentinel
function renameBandsS2(image) {
  var bands = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];  // Blue, Green, Red, NIR, SWIR1, SWIR2
  var new_bands = ['B1', 'B2', 'B3', 'B4', 'B5', 'B7'];
  return image.select(bands).rename(new_bands);
}

// Mask clouds and shadows
function maskS2clouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3) // shadow
             .and(scl.neq(8)) // cloud medium probability
             .and(scl.neq(9)) // cloud high probability
             .and(scl.neq(10)) // cirrus
  return image.updateMask(mask);
}

//========================================================================================================
// 4. BUILT IMAGE COLLECTION & ANNUAL MOSAICS
//========================================================================================================

// Create Sentinel-2 SR image collection
var getSRcollection = function(year, startDay, endDay, aoi) {
  var srCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(year + '-' + startDay, year + '-' + endDay)
    .map(maskS2clouds)       // Apply cloud masking
    .map(renameBandsS2)      // Standardize band name
    .map(function(image) {
      return image.set('system:time_start', image.get('system:time_start'))
                  .clip(aoi); // Keep time and clip to AOI
    });

  return srCollection;
};

//CREATE ANNUAL MOSAIC COLLECTION
// Function to create a Medoid Composite
var medoidMosaic = function(inCollection, dummyCollection) {
  var imageCount = inCollection.toList(1).length();
  var finalCollection = ee.ImageCollection(ee.Algorithms.If(imageCount.gt(0), inCollection, dummyCollection));
  var median = finalCollection.median();
  var difFromMedian = finalCollection.map(function(img) {
    var diff = ee.Image(img).subtract(median).pow(ee.Image.constant(2));
    return diff.reduce('sum').addBands(img);
  });
  
  return ee.ImageCollection(difFromMedian).reduce(ee.Reducer.min(7)).select([1,2,3,4,5,6], ['B1', 'B2', 'B3', 'B4', 'B5', 'B7']);
};

// Produce single annual mosaic from a year/date/AOI
var buildMosaic = function(year, startDay, endDay, aoi, dummyCollection) {                                                                      // create a temp variable to hold the upcoming annual mosiac
  var collection = getSRcollection(year, startDay, endDay, aoi);  // get the SR collection
  var img = medoidMosaic(collection, dummyCollection)                     // apply the medoidMosaic function to reduce the collection to single image per year by medoid 
              .set('system:time_start', (new Date(year,8,1)).valueOf());  // add the year to each medoid image - the data is hard-coded Aug 1st 
  return ee.Image(img);                                                   // return as image object
};

// Stack annual mosaics into a multi-year image collection (for LandTrendr time series)
var buildMosaicCollection = function(startYear, endYear, startDay, endDay, aoi, dummyCollection) {
  var imgs = [];                                                                    // create empty array to fill
  for (var i = startYear; i <= endYear; i++) {                                      // for each year from hard defined start to end build medoid composite and then add to empty img array
    var tmp = buildMosaic(i, startDay, endDay, aoi, dummyCollection);               // build the medoid mosaic for a given year
    imgs = imgs.concat(tmp.set('system:time_start', (new Date(i,8,1)).valueOf()));  // concatenate the annual image medoid to the collection (img) and set the date of the image - hard coded to the year that is being worked on for Aug 1st
  }
  return ee.ImageCollection(imgs);                                                  // return the array img array as an image collection
};
print(buildMosaicCollection, 'buildMosaicCollection')

// Dummy image collection (used if collection is empty for year/AOI)
var dummyImage = ee.Image([0,0,0,0,0,0])
  .rename(['B1', 'B2', 'B3', 'B4', 'B5', 'B7'])
  .mask(ee.Image(0));
var dummyCollection = ee.ImageCollection([dummyImage]);

//==============================================
// 4. MAPPING FUNCTION
//==============================================
// Run LandTrendr core workflow: generates disturbance maps, applies filters, and visualizes results
// Change Map Params
var mapDisturbance = function(){
  // Retrieve UI parameters for the run
  var runParams = ltgee.getParams(paramPanel);
  var startYear = startYearslider.getValue();
  var endYear = endYearslider.getValue();
  var startDay = startDayBox.getValue();
  var endDay = endDayBox.getValue();
  var index = exports.getIndexSelect(indexPanel);
    // Get AOI from user-provided coordinates and buffer
  var lon = ltgee.getCoords(coordsPanel).lon;
  var lat = ltgee.getCoords(coordsPanel).lat;
  var buffer = exports.getBuffer(bufferPanel);
  var aoi = ee.Geometry.Point(lon, lat)
                         .buffer(buffer*1000)
                         .bounds();
  // Center map for visualization
  map.centerObject(aoi,15);

// build annual image collection
var annualSRcollection = buildMosaicCollection(startYear, endYear, startDay, endDay, aoi, dummyCollection);

// Transform Collection to selected index (e.g., NDVI time series)
var ltCollection_transformed = ltgee.transformSRcollection(annualSRcollection, [index]);

// Optional: Flip index sign if needed (disturbance is decrease, recovery increase, etc)
var invertIndex = function(image) {
var inverted = image.select([index]).multiply(-1).rename(index);
  // Keep other bands (if any), or just return the inverted band
  return image.addBands(inverted, null, true);
};
// apply
var ltCollection_transformed_inverted = ltCollection_transformed.map(invertIndex);

  // RUN LandTrendr segmentation algorithm
runParams.timeSeries = ltCollection_transformed_inverted;               // add LT collection to the segmentation run parameter object
var lt = ee.Algorithms.TemporalSegmentation.LandTrendr(runParams); 

//==============================================
// 4. Visualize Results
//==============================================

//--------------------------------------
// Disturbance Mapping: Parameter Setup
//--------------------------------------

 function buildDistParams() {
  return {
    index: index,
    delta: changeTypeFilter.widgets().get(1).getValue(), // 'Loss' or 'Gain'
    sort: distTypeFilter.widgets().get(1).getValue(), // Sort by 'Greatest', 'Newest', etc
    year: {
      checked: yearFilter.widgets().get(0).getValue(),
      start: parseInt(ltgee.getYears(yearFilter).startYear),
      end: parseInt(ltgee.getYears(yearFilter).endYear)
    },
    mag: {
      checked: magFilter.widgets().get(0).getValue(),
      value: parseFloat(magFilter.widgets().get(1).widgets().get(1).getValue()),
      operator: magFilter.widgets().get(1).widgets().get(3).getValue().toString()
    },
    dur: {
      checked: durFilter.widgets().get(0).getValue(),
      value: parseFloat(durFilter.widgets().get(1).widgets().get(1).getValue()),
      operator: durFilter.widgets().get(1).widgets().get(3).getValue().toString()
    },
    preval: {
      checked: prevalFilter.widgets().get(0).getValue(),
      value: parseFloat(prevalFilter.widgets().get(1).widgets().get(1).getValue()),
      operator: prevalFilter.widgets().get(1).widgets().get(3).getValue().toString()
    },
    mmu: {
      checked: mmuFilter.widgets().get(0).getValue(),
      value: parseInt(mmuFilter.widgets().get(1).getValue())
    }
  };
}

var distParams = buildDistParams();

//--------------------------------------
// Disturbance Map & NDWI Water Mask
//--------------------------------------
  // Water masking using NDWI composite (filters out water pixels from change map)
function getWaterMask(annualSRcollection) {
  var addNDWI = function(image) {
    var ndwi = image.normalizedDifference(['B2', 'B4']).rename('NDWI');
    return image.addBands(ndwi);
  };
  var annualSRcollectionWithNDWI = annualSRcollection.map(addNDWI);
  var ndwiComposite = annualSRcollectionWithNDWI.select('NDWI').median();
  var waterMask = ndwiComposite.gte(0.0);
  return waterMask.not();
}
  // Generate final disturbance image using LandTrendr and mask water
var distImg = ltgee.getChangeMap(lt, distParams)
  .updateMask(getWaterMask(annualSRcollection));
  
//--------------------------------------
// Visualization Parameter Definitions
//--------------------------------------
  // Visualization settings for each disturbance layer
var endyear_ = d.getFullYear();
var vizParams = {
  yod: {
    min: 1990, max: endyear_,
    palette: ['#9400D3', '#4B0082', '#0000FF', '#00FF00', '#FFFF00', '#FF7F00', '#FF0000']
  },
  mag: {
    min: 0, max: 1000,
    palette: ['white', 'blue', 'purple', 'red', 'orange', 'yellow']
  },
  dur: {
    min: 1, max: 10,
    palette: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF']
  },
  normMag: {
    min: 0, max: 100,
    palette: ['white', 'orange', 'red']
  }
};

// Add disturbance layers to the map for visualization
map.layers().set(0, ui.Map.Layer(distImg.select(['dur']), vizParams.dur, 'Duration of Change'));
map.layers().set(1, ui.Map.Layer(distImg.select(['mag']), vizParams.mag, 'Magnitude of Change'));

// Build legend panels dynamically (removes old ones if present)
function buildGradientLegend(title, min, max, palette, units) {
  var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
  legend.add(ui.Label({value: title, style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0'}}));
  var gradient = ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0).multiply((max-min)/100.0).add(min),
    params: {bbox: [0,0,100,10], dimensions: '100x10', format: 'png', min: min, max: max, palette: palette},
    style: {stretch: 'horizontal', maxHeight: '20px', margin: '0 0 4px 0'}
  });
  legend.add(gradient);
  var labels = ui.Panel({
    widgets: [
      ui.Label(min.toString() + (units || ""), {margin: '4px 8px'}),
      ui.Label(max.toString() + (units || ""), {margin: '4px 8px', textAlign: 'right', stretch: 'horizontal'})
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  });
  legend.add(labels);
  return legend;
}

// Remove old legends 
if (magLegend !== null) map.remove(magLegend); // Magnitude legend
if (magPctLegend !== null) map.remove(magPctLegend); //Magnitude % normalized legend

// Magnitude legend
magLegend = buildGradientLegend('Magnitude', vizParams.mag.min, vizParams.mag.max, vizParams.mag.palette, '');
map.add(magLegend);

// Magnitude % map & legend
var magNorm = distImg.select('mag').abs().divide(2000).multiply(100).rename('mag_norm');
map.layers().set(2, ui.Map.Layer(magNorm, vizParams.normMag, 'Magnitude % Change'));
magPctLegend = buildGradientLegend('Magnitude (% change)', 0, 100, vizParams.normMag.palette, '%');
map.add(magPctLegend);

// Year of Detection layer
map.layers().set(3, ui.Map.Layer(distImg.select(['yod']), vizParams.yod, 'Year of Detection'));

 // Return LandTrendr objects for point inspection and plotting
return {lt:lt, distImg:distImg, index:index};
};

//========================================================================================================
// 6. CHARTS & INSPECTOR
//========================================================================================================

// Chart the pixel time series fit/results at a clicked point
var chartPoint = function(lt, pixel, index, indexFlip) {
  var pixelTimeSeriesData = ltgee.ltPixelTimeSeriesArray(lt, pixel, indexFlip);
  return ui.Chart(pixelTimeSeriesData.ts, 'LineChart',
            {
              'title' : 'Index: '+index + ' | Fit RMSE:'+ (Math.round(pixelTimeSeriesData.rmse * 100) / 100).toString(),
              'hAxis': 
                {
                  'format':'####'
                },
              'vAxis':
                {
                  'maxValue': 1000,
                  'minValue': -1000   
                }
            },
            {'columns': [0, 1, 2]}
          );
};


//========================================================================================================
// 7.UI LAYOUT PANELS
//========================================================================================================
// Construct control panel with year/date selection, index picker, buffer, coordinate and filter boxes
// control panel
var controlPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '340px'}
});

// --- Year Selection Sliders---
var d = new Date();
var y = d.getFullYear();
var yearSectionLabel = ui.Label('Define Year Range',{fontWeight: 'bold'});
var startYearLabel = ui.Label('Start Year');
var startYearslider = ui.Slider({min:1990, max:y, value:1990, step:1});
startYearslider.style().set('stretch', 'horizontal');
var endYearLabel = ui.Label('End Year');
var endYearslider = ui.Slider({min:1990, max:y, value:y-1, step:1});
endYearslider.style().set('stretch', 'horizontal');
var yearsPanel = ui.Panel(
  [
    yearSectionLabel,
    ui.Panel([startYearLabel, startYearslider], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'}), //
    ui.Panel([endYearLabel  , endYearslider], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'})
  ] 
);

// --- Year Selection ---
exports.yearPanel = function(){
  var d = new Date();
  var y = d.getFullYear();
  
  var yearSectionLabel = ui.Label('Define Year Range',{fontWeight: 'bold'});
  
  var startYearLabel = ui.Label('Start Year:');
  var startYearslider = ui.Slider({min:1990, max:y, value:1990, step:1});
  startYearslider.style().set('stretch', 'horizontal');
  
  var endYearLabel = ui.Label('End Year:');
  var endYearslider = ui.Slider({min:1990, max:y, value:y-1, step:1});
  endYearslider.style().set('stretch', 'horizontal');
  
  return ui.Panel(
    [
      yearSectionLabel,
      ui.Panel([startYearLabel, startYearslider], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'}), //
      ui.Panel([endYearLabel  , endYearslider], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'})
    ] 
  );
};


// --- Date Range input boxes ---
var dateSectionLabel = ui.Label('Define Date Range (month-day)',{fontWeight: 'bold'});
var startDayLabel = ui.Label('Start Date:');
var startDayBox = ui.Textbox({value:'01-01'});
startDayBox.style().set('stretch', 'horizontal');
var endDayLabel = ui.Label('End Date:');
var endDayBox = ui.Textbox({value:'12-31'});
endDayBox.style().set('stretch', 'horizontal');

var datesPanel = ui.Panel(
  [
    dateSectionLabel,
    ui.Panel(
      [startDayLabel, startDayBox, endDayLabel, endDayBox],
      ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'}
    )
  ]
);



// --- Plot & Inspector Panel ---
var plotsPanelLabel = ui.Panel([
  ui.Label('Instructions', {fontWeight: 'bold'}),
  ui.Label('1) Define mapping options in control panel'),
  ui.Label('2) Click a point or enter & submit coordinates'),
  ui.Label('3) Check the "Inspector" box and click a point for info'),
  ui.Label('* Wait patiently for map and point info to load'),
  ui.Label('* Click here for more information', {}, 'https://goo.gl/uDk4GY'),
  ui.Label('____________________________________________________'),
]);
var inspectorCheck = ui.Checkbox({label:'Inspector', value:0, style:{fontWeight: 'bold'}});
var yodLabel = ui.Label('');
var magLabel = ui.Label('');
var durLabel = ui.Label('');
var prevaLabel = ui.Label('');
var rateLabel = ui.Label('');
var plotPanel = ui.Panel(null, null, {stretch: 'horizontal'});
var warningPanel = ui.Label('');
var plotPanelParent = ui.Panel([
  plotsPanelLabel, 
  inspectorCheck, 
  yodLabel,
  magLabel,
  durLabel,
  prevaLabel,
  rateLabel,
  plotPanel,
  warningPanel], null, {width: '350px'});

// Set up additional panels for indices, buffer, coordinates, segmentation parameters, disturbance filters, etc.
var datePanel = ltgee.datePanel();
var indexPanel = exports.indexPanel();
var bufferPanel = exports.bufferPanel();
var coordsPanel = ltgee.coordsPanel();
var paramPanel = ltgee.paramPanel();

// Disturbance mapping filter panels (type, sorting, filtering options)
var changeTypeList = ['Loss','Gain'];
var changeTypeFilter = ui.Panel(
  [ui.Label({value:'Select Vegetation Change Type:', style:{color:'blue'}}),ui.Select({items:changeTypeList, value:'Loss', style:{stretch: 'horizontal'}})], ui.Panel.Layout.Flow('horizontal')
);

var distTypeList = ['Greatest','Least','Newest','Oldest','Fastest','Slowest'];
var distTypeFilter = ui.Panel(
  [ui.Label({value:'Select Vegetation Change Sort:', style:{color:'blue'}}),ui.Select({items:distTypeList, value:'Greatest', style:{stretch: 'horizontal'}})], ui.Panel.Layout.Flow('horizontal')
);

var yearFilter = exports.yearPanel()
yearFilter.remove(yearFilter.widgets().get(0));
yearFilter.insert(0, ui.Checkbox({label:'Filter by Year:', style:{color:'blue'}}));
yearFilter.widgets().get(1).style().set('padding', '0px 0px 0px 20px');
yearFilter.widgets().get(2).style().set('padding', '0px 0px 0px 20px');

var opList = ['>', '<'];
var magFilter = ui.Panel(
  [
    ui.Checkbox({label:'Filter by Magnitude:', style:{color:'blue'}}),
    ui.Panel(
      [
        ui.Label('Value:'),
        ui.Textbox({value:100, style:{stretch: 'horizontal'}}),
        ui.Label('Operator:'),
        ui.Select({items:opList, value:'>', style:{stretch: 'horizontal'}})
      ], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal', padding: '0px 0px 0px 20px'})
  ],
  null,
  {stretch: 'horizontal'}
);


var durFilter = ui.Panel(
  [
    ui.Checkbox({label:'Filter by Duration:', style:{color:'blue'}}),
    ui.Panel(
      [
        ui.Label('Value:'),
        ui.Textbox({value:4, style:{stretch: 'horizontal'}}),
        ui.Label('Operator:'),
        ui.Select({items:opList, value:'<', style:{stretch: 'horizontal'}})
      ], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal', padding: '0px 0px 0px 20px'})
  ],
  null,
  {stretch: 'horizontal'}
);

var prevalFilter = ui.Panel(
  [
    ui.Checkbox({label:'Filter by Pre-Dist Value:', style:{color:'blue'}}),
    ui.Panel(
      [
        ui.Label('Value:'),
        ui.Textbox({value:600, style:{stretch: 'horizontal'}}),
        ui.Label('Operator:'),
        ui.Select({items:opList, value:'>', style:{stretch: 'horizontal'}})
      ], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal', padding: '0px 0px 0px 20px'})
  ],
  null,
  {stretch: 'horizontal'}
);


var mmuFilter = ui.Panel(
  [
    ui.Checkbox({label:'Filter by MMU:', style:{color:'blue'}}),
    ui.Textbox({value:11, style:{stretch: 'horizontal'}}) 
  ],
  ui.Panel.Layout.Flow('horizontal'),
  {stretch: 'horizontal'}
);

// dist Params 
var distParams = ui.Panel(
  [
    ui.Label('Define Change Mapping Parameters',{fontWeight: 'bold'}),
    changeTypeFilter,
    distTypeFilter,
    yearFilter,
    magFilter,
    durFilter,
    prevalFilter,
    mmuFilter
  ]
);

var submitButton = ltgee.submitButton();

//========================================================================================================
// 9. MAP INTERACTION LOGIC
//========================================================================================================

var changeMap;
var ltMap;
var ltIndex;
var dirty = 0;
map.onClick(function(coords) {
  //Inspector mode: Only get pixel info rather than rerunning change mapping

  if(inspectorCheck.getValue() === true){
    if(dirty === 0){
      plotPanelParent.widgets().get(8).clear();
      plotPanelParent.widgets().get(8).setValue('Warning: No change has been mapped. Turn "Inspector" off & click a point on the map, or enter & sumbit a coordinates to map change');
      return;
    }
    var point = ee.Geometry.Point(coords.lon, coords.lat);
    var pixel = point.buffer(15).bounds();
    var result = ltgee.getPixelInfo(changeMap, pixel);
    plotPanelParent.widgets().get(2).setValue('Year:      '+result.yod);
    plotPanelParent.widgets().get(3).setValue('Magnitude: '+Math.round(result.mag));
    plotPanelParent.widgets().get(4).setValue('Duration:  '+Math.round(result.dur));
    plotPanelParent.widgets().get(5).setValue('Pre-value: '+Math.round(result.preval));
    plotPanelParent.widgets().get(6).setValue('Rate:      '+Math.round(result.rate));
    
    var indexFlip = ltgee.indexFlipper(ltIndex);
    var chart = chartPoint(ltMap, pixel, ltIndex, indexFlip);
    plotPanel = plotPanel.clear();
    plotPanel.add(chart);
  } else{  
    // change the coords in the box (for repeat runs)
    coordsPanel.widgets().get(1).widgets().get(1).setValue(coords.lon);
    coordsPanel.widgets().get(1).widgets().get(3).setValue(coords.lat);
    
    // / Draw disturbance/change layers and run new LandTrendr analysis
    var changeObj = mapDisturbance();
    changeMap = changeObj.distImg;
    ltMap = changeObj.lt;
    ltIndex = changeObj.index;
    dirty = 1;
  }
  
});

submitButton.onClick(function(){
  var changeObj = mapDisturbance();
  changeMap = changeObj.distImg;
  ltMap = changeObj.lt;
  ltIndex = changeObj.index;
  dirty = 1;
});


//========================================================================================================
// 10. FINAL UI DRAWING
//========================================================================================================

// add panels to interface
controlPanel.add(yearsPanel);
controlPanel.add(datesPanel);
controlPanel.add(indexPanel);
controlPanel.add(coordsPanel);
//controlPanel.add(inspectorCheck);
controlPanel.add(bufferPanel);
controlPanel.add(distParams);
controlPanel.add(paramPanel);
controlPanel.add(submitButton);

// Clear any default UI layout and draw all custom panels
ui.root.clear();
ui.root.add(controlPanel);
ui.root.add(map);
ui.root.add(plotPanelParent);

//########################################################################################################
//#                                      END OF SCRIPT                                                   #
//########################################################################################################
