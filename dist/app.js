(() => {
  "use strict";

  const D = window.RESEARCH_DATA;
  const M = window.MAP_DATA;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const escapeHtml = value => String(value ?? "—").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));

  /* Page shell and remembered light/dark appearance */
  const themeToggle = $("#themeToggle");
  const preferredTheme = localStorage.getItem("friant-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = preferredTheme;
  const chartRedrawers = [];
  function updateThemeButton() {
    const dark = document.documentElement.dataset.theme === "dark";
    $(".theme-text", themeToggle).textContent = dark ? "Light" : "Dark";
    themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
  }
  updateThemeButton();
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("friant-theme", next);
    updateThemeButton();
    chartRedrawers.forEach(fn => fn());
  });

  const navToggle = $(".nav-toggle");
  const nav = $(".site-nav");
  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  $$(".site-nav a").forEach(link => link.addEventListener("click", () => nav.classList.remove("open")));

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("visible"); revealObserver.unobserve(entry.target); } });
  }, { threshold: .08 });
  $$(".reveal").forEach(node => revealObserver.observe(node));

  Object.entries(D.counts).forEach(([key, value]) => {
    const node = document.querySelector(`[data-count="${key}"]`);
    if (node) node.textContent = fmt.format(value);
  });
  if ($("#generatedDate")) $("#generatedDate").textContent = new Date(`${D.generated}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  async function loadCurrentWeather() {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=37.00&longitude=-119.71&current=temperature_2m,relative_humidity_2m,precipitation&daily=precipitation_sum&temperature_unit=celsius&precipitation_unit=mm&timezone=America%2FLos_Angeles&forecast_days=1";
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const weather = await response.json();
      $("#currentTemperature").textContent = `${fmt1.format(weather.current.temperature_2m)} °C`;
      $("#currentHumidity").textContent = `${fmt.format(weather.current.relative_humidity_2m)}%`;
      $("#currentRainfall").textContent = `${fmt1.format(weather.daily.precipitation_sum[0])} mm`;
      $("#weatherTime").textContent = `${weather.current.time.replace("T", " ")} PT`;
    } catch (error) {
      $("#weatherTime").textContent = "Live feed unavailable";
      $("#currentTemperature").textContent = "—";
      $("#currentHumidity").textContent = "—";
      $("#currentRainfall").textContent = "—";
    }
  }
  loadCurrentWeather();

  /* Lightweight, dependency-free canvas charts */
  const chartColours = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    return {
      text: dark ? "#b9c8d8" : "#526177",
      grid: dark ? "rgba(183,199,214,.15)" : "rgba(43,65,87,.13)",
      c1: "#3b82f6", c2: "#e9a23b", teal: "#16b8aa", coral: "#ef765d", violet: "#8b5cf6", pale: "#9cc8da"
    };
  };
  function canvasFrame(canvas, fixedHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(300, canvas.clientWidth || 600);
    const height = fixedHeight || parseInt(getComputedStyle(canvas).height, 10) || 330;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }
  function niceMax(value) {
    if (!value) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    return Math.ceil(value / magnitude) * magnitude;
  }
  function formatAxis(value) {
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}m`;
    if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  function drawAxes(ctx, width, height, margin, yMax, ySuffix = "") {
    const C = chartColours();
    ctx.font = "11px Inter, sans-serif"; ctx.fillStyle = C.text; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (height - margin.top - margin.bottom) * i / 4;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
      const val = yMax * (1 - i / 4);
      ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(`${formatAxis(val)}${ySuffix}`, margin.left - 8, y);
    }
  }
  function lineChart(canvas, rows, series, options = {}) {
    const draw = () => {
      const {ctx, width, height} = canvasFrame(canvas);
      const C = chartColours(); const margin = {top: 18, right: 12, bottom: 32, left: 55};
      const values = rows.flatMap(r => series.map(s => r[s.key])).filter(Number.isFinite);
      const yMax = options.yMax || niceMax(Math.max(...values, 1));
      drawAxes(ctx, width, height, margin, yMax, options.ySuffix || "");
      const x = i => margin.left + i * (width - margin.left - margin.right) / Math.max(1, rows.length - 1);
      const y = v => margin.top + (yMax - v) * (height - margin.top - margin.bottom) / yMax;
      series.forEach(s => {
        ctx.strokeStyle = C[s.colour] || s.colour; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.lineCap = "round";
        let started = false; ctx.beginPath();
        rows.forEach((row, i) => {
          const value = row[s.key];
          if (!Number.isFinite(value)) { started = false; return; }
          if (!started) { ctx.moveTo(x(i), y(value)); started = true; } else ctx.lineTo(x(i), y(value));
        });
        ctx.stroke();
      });
      const ticks = [...new Set([0, Math.floor((rows.length-1)/4), Math.floor((rows.length-1)/2), Math.floor(3*(rows.length-1)/4), rows.length-1])];
      ctx.fillStyle = C.text; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ticks.forEach(i => ctx.fillText(rows[i].year, x(i), height - margin.bottom + 9));
    };
    chartRedrawers.push(draw); draw(); new ResizeObserver(draw).observe(canvas);
  }
  function verticalBarChart(canvas, rows, valueKey, options = {}) {
    const draw = () => {
      const {ctx, width, height} = canvasFrame(canvas); const C = chartColours();
      const margin = {top: 18, right: 12, bottom: 34, left: 55};
      const yMax = niceMax(Math.max(...rows.map(r => r[valueKey]), 1));
      drawAxes(ctx, width, height, margin, yMax, options.ySuffix || "");
      const plotW = width - margin.left - margin.right; const barW = Math.max(2, plotW / rows.length * .72);
      rows.forEach((row, i) => {
        const cx = margin.left + (i + .5) * plotW / rows.length;
        const h = row[valueKey] / yMax * (height - margin.top - margin.bottom);
        ctx.fillStyle = options.colourFn ? options.colourFn(row, C) : C[options.colour || "teal"];
        ctx.fillRect(cx - barW/2, height - margin.bottom - h, barW, h);
      });
      ctx.fillStyle = C.text; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const step = Math.max(1, Math.ceil(rows.length / 6)); rows.forEach((row, i) => { if (i % step === 0 || i === rows.length-1) ctx.fillText(row.year || row.county, margin.left + (i+.5)*plotW/rows.length, height-margin.bottom+9); });
    };
    chartRedrawers.push(draw); draw(); new ResizeObserver(draw).observe(canvas);
  }
  function horizontalBarChart(canvas, rows, labelKey, valueKey) {
    const draw = () => {
      const {ctx, width, height} = canvasFrame(canvas, 420); const C = chartColours();
      const margin = {top: 8, right: 70, bottom: 18, left: Math.min(170, width * .38)};
      const max = Math.max(...rows.map(r => r[valueKey]), 1); const rowH = (height-margin.top-margin.bottom)/rows.length;
      rows.forEach((row, i) => {
        const y = margin.top + i*rowH + rowH*.18; const h = rowH*.62; const w = row[valueKey]/max*(width-margin.left-margin.right);
        ctx.fillStyle = i % 2 ? C.teal : C.c1; ctx.globalAlpha = .86; ctx.fillRect(margin.left, y, w, h); ctx.globalAlpha = 1;
        ctx.fillStyle = C.text; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(row[labelKey], margin.left-8, y+h/2);
        ctx.textAlign = "left"; ctx.fillText(`${fmt.format(row[valueKey])} ac`, margin.left+w+7, y+h/2);
      });
    };
    chartRedrawers.push(draw); draw(); new ResizeObserver(draw).observe(canvas);
  }

  lineChart($("#allocationChart"), D.allocation, [{key:"class1", colour:"c1"}, {key:"class2", colour:"c2"}], {yMax:1, ySuffix:""});
  lineChart($("#deliveryChart"), D.classDeliveries, [{key:"class1Af", colour:"c1"}, {key:"class2Af", colour:"c2"}]);
  verticalBarChart($("#wellChart"), D.wellRecords, "records", {colour:"coral"});
  verticalBarChart($("#rainfallChart"), D.rainfall, "mm", {colourFn:(row,C) => row.mm < 220 ? C.coral : C.c1});
  verticalBarChart($("#populationChart"), D.population, "population", {colour:"teal"});
  horizontalBarChart($("#cropChart"), D.crops.slice(0, 10), "group", "acres");

  const cropFields = D.crops.reduce((a,b) => a+b.fields, 0);
  const cropAcres = D.crops.reduce((a,b) => a+b.acres, 0);
  const fallow = D.crops.find(d => d.group === "Idle or fallow")?.acres || 0;
  $("#cropFieldTotal").textContent = fmt.format(cropFields);
  $("#cropAcreTotal").textContent = `${fmt.format(cropAcres)} ac`;
  $("#fallowAcreTotal").textContent = `${fmt.format(fallow)} ac`;
  $("#populationTotal").textContent = `${(D.population.reduce((a,b)=>a+b.population,0)/1e6).toFixed(2)} million`;

  const F = D.class2Feasibility;
  $("#episodeCount").textContent = fmt.format(F.primaryEpisodes);
  $("#contractorCount").textContent = fmt.format(F.primaryContractors);
  $("#droughtCount").textContent = fmt.format(F.nextDroughtYears.length);
  $("#outcomeCount").textContent = fmt.format(F.episodesWithGroundwaterOutcomes);

  function renderDistrictTable(query = "") {
    const q = query.trim().toLowerCase();
    const rows = D.districts.filter(d => d.district_name.toLowerCase().includes(q)).sort((a,b) => (b.mapped_lulc_acres||0)-(a.mapped_lulc_acres||0));
    $("#districtTableBody").innerHTML = rows.map(d => `<tr><td><b>${escapeHtml(d.label_id)}</b> ${escapeHtml(d.district_name)}</td><td>${fmt.format(d.mapped_lulc_acres || 0)}</td><td>${d.permanent_crop_share == null ? "—" : fmt1.format(d.permanent_crop_share*100)+"%"}</td><td>${fmt.format(d.idle_fallow_acres || 0)}</td><td>${fmt.format(d.well_completion_records || 0)}</td><td>${escapeHtml(d.mean_score_class || "No data")}</td></tr>`).join("");
  }
  renderDistrictTable();
  $("#districtSearch").addEventListener("input", event => renderDistrictTable(event.target.value));

  /* Publication-map explorer */
  const themes = [
    {id:"study", label:"Study area", category:"Study geography", title:"Friant irrigation landscape", image:"assets/study-area.png", desc:"District boundaries, federal canals, crop and land-use polygons, well-completion records, groundwater monitoring points and approximate turnout references.", source:"USBR; California DWR crop mapping and well-completion service; USGS monitoring locations."},
    {id:"lulc", label:"LULC", category:"Land use", title:"2023 crop and land use", image:"assets/lulc-map.png", desc:"A clipped 2023 snapshot of mapped crop and land-use units. It describes crop composition, not farm ownership or legal parcels.", source:"California DWR 2023 Statewide Crop Mapping."},
    {id:"dem", label:"Elevation", category:"Terrain", title:"Digital elevation model", image:"assets/dem.png", desc:"Elevation provides the base surface from which slope and drainage are derived. It helps describe topographic controls on runoff and infiltration.", source:"USGS 3DEP digital elevation data, processed to the study area."},
    {id:"slope", label:"Slope", category:"Terrain", title:"Slope", image:"assets/slope.png", desc:"Flatter areas can favour infiltration where soils and geology permit it; steeper ground tends to promote faster runoff. Slope alone does not establish recharge.", source:"Derived from the USGS elevation model."},
    {id:"drainage", label:"Drainage", category:"Hydrology", title:"Drainage density", image:"assets/drainage-density.png", desc:"Drainage density describes the length of mapped or modelled drainage per unit area. Its interpretation depends on terrain, soil and geology.", source:"Derived from the elevation surface within the reproducible package."},
    {id:"network", label:"Streams", category:"Hydrology", title:"Drainage network", image:"assets/drainage-network.png", desc:"Modelled flow paths show how the elevation surface routes water across the study landscape.", source:"D8 flow-routing derivation from the elevation model."},
    {id:"order", label:"Stream order", category:"Hydrology", title:"Strahler stream order", image:"assets/stream-order.png", desc:"Stream order distinguishes smaller headwater paths from progressively larger drainage channels in the modelled network.", source:"Derived from the D8 drainage network."},
    {id:"geology", label:"Geology", category:"Subsurface setting", title:"Generalised geology", image:"assets/geology.png", desc:"Rock and sediment types influence aquifer geometry, permeability and groundwater movement. Generalised geology cannot replace aquifer tests.", source:"California Geological Survey generalised rock types."},
    {id:"landform", label:"Landform", category:"Surface form", title:"Geomorphology", image:"assets/geomorphology.png", desc:"Landform classes derived from terrain help distinguish valley floors, plains, slopes and ridges.", source:"Terrain-derived classification in the research package."},
    {id:"soil", label:"Soil", category:"Infiltration context", title:"Soil hydrologic groups", image:"assets/soil.png", desc:"Hydrologic soil groups describe runoff and infiltration behaviour under specified conditions. They do not measure deep percolation on their own.", source:"USDA NRCS SSURGO map units and hydrologic groups."},
    {id:"rain", label:"Rainfall", category:"Climate", title:"Mean annual rainfall, 1993–2025", image:"assets/rainfall.png", desc:"The long-period mean provides climatic context. Annual rainfall remains available separately for temporal analysis.", source:"gridMET daily precipitation aggregated and area weighted; 1993–2025."},
    {id:"aquifer", label:"Aquifer", category:"Groundwater setting", title:"Groundwater basins", image:"assets/aquifer.png", desc:"Bulletin 118 boundaries organise groundwater management and hydrogeologic context. A basin boundary does not imply uniform storage or access.", source:"California DWR Bulletin 118."},
    {id:"depth", label:"GW depth", category:"Observed groundwater", title:"Depth to groundwater", image:"assets/groundwater-level.png", desc:"Monitoring measurements show where groundwater was observed below land surface. Coverage and timing differ across locations.", source:"California groundwater monitoring measurements assembled in the package."},
    {id:"recharge", label:"Recharge", category:"Screening index", title:"Recharge opportunity", image:"assets/recharge.png", desc:"A relative opportunity index combines selected physical factors. It does not show realised recharge volume or permission to recharge.", source:"Derived screening layer; inspect method and input assumptions before inference."},
    {id:"gwp", label:"GW potential", category:"Screening index", title:"Groundwater-potential zones", image:"assets/gwp-zones.png", desc:"A multi-criteria screening product that summarises the selected themes. It must be validated and must not be read as groundwater availability.", source:"Derived research layer; pilot weights are subject to sensitivity analysis."},
    {id:"class2area", label:"Class 2 area", category:"Contract exposure", title:"Class 2 contractors and study area", image:"assets/class2-study-area.png", desc:"The mapped contractor geography used to link wet-year deliveries with later drought outcomes.", source:"USBR contractor records joined to the assembled district geography."},
    {id:"class2history", label:"Class 2 history", category:"Water delivery", title:"Class 2 delivery history", image:"assets/class2-delivery-history.png", desc:"Observed Class 2 deliveries vary across time. The series helps locate wet-year exposure before later droughts.", source:"USBR Article 13 system and contractor delivery records compiled in the package."},
    {id:"class2exposure", label:"Class 2 exposure", category:"Empirical design", title:"Wet-year Class 2 exposure", image:"assets/class2-exposure.png", desc:"A contractor-level map of observed wet-year Class 2 exposure used to define the proposed drought-insurance treatment.", source:"Compiled contractor deliveries, district acreage and matched geography."},
    {id:"integrated", label:"Integrated", category:"Empirical design", title:"Integrated empirical map", image:"assets/class2-integrated-map.png", desc:"Contractor exposure is viewed alongside groundwater and well-outcome coverage to assess where the empirical design is currently measurable.", source:"Integrated GIS and contractor-year feasibility package."}
  ];
  const themeButtons = $("#themeButtons");
  themes.forEach((theme, i) => {
    const button = document.createElement("button"); button.type = "button"; button.role = "tab"; button.textContent = theme.label; button.dataset.themeId = theme.id;
    if (i === 0) button.classList.add("active"); button.addEventListener("click", () => selectTheme(theme)); themeButtons.appendChild(button);
  });
  function selectTheme(theme) {
    $$("button", themeButtons).forEach(b => { const active = b.dataset.themeId === theme.id; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); });
    $("#themeImage").src = theme.image; $("#themeImage").alt = theme.title;
    $("#themeCategory").textContent = theme.category; $("#themeTitle").textContent = theme.title; $("#themeDescription").textContent = theme.desc; $("#themeSource").textContent = `Source: ${theme.source}`;
  }
  selectTheme(themes[0]);
  const imageDialog = $("#imageDialog");
  $("#themeImageButton").addEventListener("click", () => { $("#dialogImage").src = $("#themeImage").src; $("#dialogImage").alt = $("#themeImage").alt; imageDialog.showModal(); });
  $("#closeDialog").addEventListener("click", () => imageDialog.close());
  imageDialog.addEventListener("click", event => { if (event.target === imageDialog) imageDialog.close(); });

  /* Georeferenced map */
  if (!window.L || !M) {
    $("#researchMap").innerHTML = '<div style="padding:2rem">The map library or prepared layers could not be loaded. Open this folder through a local web server and confirm that vendor/leaflet.js and data/map-data.js are present.</div>';
    return;
  }
  const canvasRenderer = L.canvas({ padding: .5 });
  const map = L.map("researchMap", { preferCanvas: true, zoomControl: false, renderer: canvasRenderer, minZoom: 5 });
  L.control.zoom({ position: "topright" }).addTo(map);
  const attribution = '&copy; <a href="https://www.esri.com/">Esri</a>; research overlays retain their listed sources';
  const baseMaps = {
    esriLight: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {maxZoom: 19, attribution}),
    esriImagery: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom: 19, attribution}),
    esriTopo: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {maxZoom: 19, attribution}),
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'})
  };
  let activeBase = baseMaps.esriLight.addTo(map);
  const cropColours = {"Citrus and subtropical":"#f59e0b","Deciduous fruit and nuts":"#7c3aed","Field crops":"#eab308","Grain and hay":"#d4a72c","Idle or fallow":"#9ca3af","Pasture":"#65a30d","Rice":"#7dd3fc","Truck, nursery and berry":"#e76f51","Vineyards":"#8b6f92","Native vegetation":"#647d55","Urban / developed":"#4b5563","Water":"#38a3db","Other / unclassified":"#cbd5e1"};
  const palette = ["#e8edf1", "#b7d5e5", "#71b7cc", "#238ea6", "#09566c"];
  const colourFor = (value, max) => !Number.isFinite(value) ? "#d8dddf" : palette[Math.min(4, Math.floor((value / Math.max(max, 1))*4.999))];
  const hashColour = value => { let h=0; for (const ch of String(value)) h=(h*31+ch.charCodeAt(0))%360; return `hsl(${h} 44% 55%)`; };
  function popupTable(props, title) {
    const entries = Object.entries(props).filter(([,v]) => v !== null && v !== undefined && v !== "").slice(0, 12);
    return `<div class="popup-table"><b>${escapeHtml(title || "Mapped feature")}</b>${entries.map(([k,v]) => `<div><span>${escapeHtml(k.replaceAll("_"," "))}</span><strong>${typeof v === "number" ? fmt1.format(v) : escapeHtml(v)}</strong></div>`).join("")}</div>`;
  }
  const districtMax1 = Math.max(...M.districts.features.map(f => f.properties.class_1_reference_quantity_af || 0));
  const districtMax2 = Math.max(...M.districts.features.map(f => f.properties.class_2_reference_quantity_af || 0));
  const layerDefs = {
    study: L.geoJSON(M.study, {style:{color:"#07152a", weight:2.4, fill:false, dashArray:"7 5"}}),
    districts: L.geoJSON(M.districts, {style:{color:"#475569", weight:.8, fillColor:"#ffffff", fillOpacity:.03}, onEachFeature:(f,l)=>{l.bindPopup(popupTable(f.properties,f.properties.district_name)); l.bindTooltip(f.properties.label_id || "", {permanent:true, direction:"center", className:"district-label"});}}),
    canals: L.geoJSON(M.canals, {style:f=>({color:(f.properties.canal_mc||"").includes("Madera")?"#d97706":"#0057b8", weight:4}), onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,f.properties.canal_mc))}),
    cropLand: L.geoJSON(M.cropLand, {style:f=>({color:"#ffffff", weight:.25, fillColor:cropColours[f.properties.map_group]||"#a8b0b4", fillOpacity:.5}), onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,f.properties.map_group))}),
    class1: L.geoJSON(M.districts, {style:f=>({color:"#1747a6", weight:1.2, fillColor:colourFor(f.properties.class_1_reference_quantity_af,districtMax1), fillOpacity:.72}), onEachFeature:(f,l)=>l.bindPopup(`<b>${escapeHtml(f.properties.district_name)}</b><p>Class 1 historical reference: <strong>${f.properties.class_1_reference_quantity_af == null ? "Not matched" : fmt.format(f.properties.class_1_reference_quantity_af)+" AF"}</strong></p><small>${escapeHtml(D.notes.classReferences)}</small>`)}),
    class2: L.geoJSON(M.districts, {style:f=>({color:"#9a5a00", weight:1.2, fillColor:colourFor(f.properties.class_2_reference_quantity_af,districtMax2), fillOpacity:.72}), onEachFeature:(f,l)=>l.bindPopup(`<b>${escapeHtml(f.properties.district_name)}</b><p>Class 2 historical reference: <strong>${f.properties.class_2_reference_quantity_af == null ? "Not matched" : fmt.format(f.properties.class_2_reference_quantity_af)+" AF"}</strong></p><small>${escapeHtml(D.notes.classReferences)}</small>`)}),
    class2Exposure: L.geoJSON(M.class2Exposure, {style:f=>({color:"#7c2d12", weight:1.1, fillColor:colourFor(f.properties.c2_1kac,10000), fillOpacity:.7}), onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,f.properties.contractor))}),
    wells: L.geoJSON(M.wells, {renderer:canvasRenderer, pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:2,color:"#5b4636",fillColor:"#5b4636",fillOpacity:.42,weight:0}), onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,"Well-completion record"))}),
    monitors: L.geoJSON(M.monitors, {renderer:canvasRenderer, pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:2.4,color:"#fff",fillColor:"#06b6d4",fillOpacity:.58,weight:.25}), onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,"Groundwater monitoring site"))}),
    turnouts: L.geoJSON(M.turnouts, {pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:5,color:"white",fillColor:"#ef4444",fillOpacity:.95,weight:1}), onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,"Approximate turnout"))}),
    rise: L.geoJSON(M.rise, {pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:7,color:"#111827",fillColor:"#fde047",fillOpacity:1,weight:1.5}), onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,"USBR RISE site"))}),
    basins: L.geoJSON(M.basins, {style:{color:"#6d28d9",weight:1.5,dashArray:"5 4",fillColor:"#8b5cf6",fillOpacity:.06},onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,f.properties.Basin_Subbasin_Name))}),
    geology: L.geoJSON(M.geology, {style:f=>({color:"#fff",weight:.3,fillColor:hashColour(f.properties.GENERAL_LITHOLOGY),fillOpacity:.55}),onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,"Geology"))}),
    soils: L.geoJSON(M.soils, {style:f=>({color:"#fff",weight:.3,fillColor:hashColour(f.properties.hydgrp),fillOpacity:.55}),onEachFeature:(f,l)=>l.bindPopup(popupTable(f.properties,"Soil hydrologic group"))})
  };
  const visible = new Set(["study","districts","canals","cropLand"]);
  visible.forEach(name => layerDefs[name].addTo(map));
  const studyBounds = layerDefs.study.getBounds(); map.fitBounds(studyBounds, {padding:[18,18]});
  const rasterLayers = Object.fromEntries(Object.entries(M.rasters).map(([key,value]) => [key,L.imageOverlay(value.url,value.bounds,{opacity:.65,interactive:false})]));
  const visibleRasters = new Set();
  const legend = $("#mapLegend");
  function setLegend(title, items=[]) { legend.innerHTML = `<b>${escapeHtml(title)}</b>${items.map(i=>`<span><i style="background:${i[0]}"></i>${escapeHtml(i[1])}</span>`).join("")}`; legend.classList.toggle("visible", Boolean(title)); }
  function refreshLegend(name) {
    if (name === "class1") setLegend("Class 1 reference", [[palette[0],"lower or unmatched"],[palette[2],"middle"],[palette[4],"higher"]]);
    else if (name === "class2") setLegend("Class 2 reference", [[palette[0],"lower or unmatched"],[palette[2],"middle"],[palette[4],"higher"]]);
    else if (name === "cropLand") setLegend("2023 crop / land use", [[cropColours["Deciduous fruit and nuts"],"fruit and nuts"],[cropColours["Citrus and subtropical"],"citrus"],[cropColours["Idle or fallow"],"idle / fallow"]]);
    else if (name) setLegend(name.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase()), [["#f1f5f9","lower"],["#55a3a3","middle"],["#144e65","higher"]]);
    else setLegend("");
  }
  refreshLegend("cropLand");
  $$('[data-layer]').forEach(input => input.addEventListener("change", () => {
    const name = input.dataset.layer, layer = layerDefs[name]; if (!layer) return;
    if (input.checked) { layer.addTo(map); visible.add(name); refreshLegend(name); } else { map.removeLayer(layer); visible.delete(name); if (legend.textContent.toLowerCase().includes(name.toLowerCase())) refreshLegend(""); }
  }));
  $$('[data-raster]').forEach(input => input.addEventListener("change", () => {
    const name=input.dataset.raster, layer=rasterLayers[name];
    if (input.checked) { layer.addTo(map); layer.bringToBack(); activeBase.bringToBack(); visibleRasters.add(name); refreshLegend(name); }
    else { map.removeLayer(layer); visibleRasters.delete(name); if (!visibleRasters.size) refreshLegend(""); }
  }));
  $("#rasterOpacity").addEventListener("input", event => { const value=Number(event.target.value)/100; $("#rasterOpacityValue").textContent=`${event.target.value}%`; Object.values(rasterLayers).forEach(layer=>layer.setOpacity(value)); });
  $$('input[name="basemap"]').forEach(input => input.addEventListener("change", () => { map.removeLayer(activeBase); activeBase=baseMaps[input.value].addTo(map); activeBase.bringToBack(); }));
  $("#fitStudyButton").addEventListener("click", () => map.fitBounds(studyBounds,{padding:[18,18]}));
  $("#resetMap").addEventListener("click", () => {
    Object.entries(layerDefs).forEach(([name,layer]) => { const keep=["study","districts","canals","cropLand"].includes(name); if (keep && !map.hasLayer(layer)) layer.addTo(map); if (!keep && map.hasLayer(layer)) map.removeLayer(layer); });
    Object.values(rasterLayers).forEach(layer => map.removeLayer(layer)); visibleRasters.clear();
    $$('[data-layer]').forEach(input => input.checked=["study","districts","canals","cropLand"].includes(input.dataset.layer)); $$('[data-raster]').forEach(input=>input.checked=false); refreshLegend("cropLand"); map.fitBounds(studyBounds,{padding:[18,18]});
  });
  const coordinateReadout = $("#coordinateReadout");
  map.on("mousemove", e => coordinateReadout.textContent=`Latitude ${e.latlng.lat.toFixed(5)} · Longitude ${e.latlng.lng.toFixed(5)} (WGS 84)`);
  map.on("click", e => L.popup().setLatLng(e.latlng).setContent(`<b>Map coordinate</b><br>Latitude: ${e.latlng.lat.toFixed(6)}<br>Longitude: ${e.latlng.lng.toFixed(6)}<br><small>WGS 84 / EPSG:4326</small>`).openOn(map));
  $("#locateButton").addEventListener("click", () => map.locate({setView:true,maxZoom:13,enableHighAccuracy:true}));
  map.on("locationfound", e => L.circleMarker(e.latlng,{radius:8,color:"#fff",weight:2,fillColor:"#0e8a86",fillOpacity:1}).addTo(map).bindPopup(`Your browser-reported location<br><small>accuracy about ${fmt.format(e.accuracy)} m</small>`).openPopup());
  map.on("locationerror", e => { coordinateReadout.textContent=`Location unavailable: ${e.message}`; });
})();
