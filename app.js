const constants = {
  pidGainMax: 250,
  fGainMax: 1000,
  dynLpfMaxHz: 1000,
  lpfMaxHz: 1000,
  pidDefaults: {
    roll: { P: 45, I: 80, D: 30, F: 120 },
    pitch: { P: 47, I: 84, D: 34, F: 125 },
    yaw: { P: 45, I: 80, D: 0, F: 120 },
  },
  dMaxDefaults: { roll: 40, pitch: 46, yaw: 0 },
  dtermDefaults: {
    lpf1DynMin: 75,
    lpf1DynMax: 150,
    lpf1Static: 75,
    lpf2Static: 150,
  },
  gyroDefaults: {
    lpf1DynMin: 250,
    lpf1DynMax: 500,
    lpf1Static: 250,
    lpf2Static: 500,
  },
};

const sliderDefs = [
  { key: "d", label: "D Gain", min: 0, max: 200, value: 100, cli: "simplified_d_gain" },
  { key: "pi", label: "P&I Gain", min: 0, max: 200, value: 100, cli: "simplified_pi_gain" },
  { key: "ff", label: "Feedforward Gain", min: 0, max: 200, value: 100, cli: "simplified_feedforward_gain" },
  { key: "dmax", label: "D Max Gain", min: 0, max: 200, value: 100, cli: "simplified_d_max_gain" },
  { key: "i", label: "I Gain", min: 0, max: 200, value: 100, cli: "simplified_i_gain" },
  { key: "pitchD", label: "Pitch:Roll D", min: 0, max: 200, value: 100, cli: "simplified_pitch_d_gain" },
  { key: "pitchPi", label: "Pitch:Roll P,I&FF", min: 0, max: 200, value: 100, cli: "simplified_pitch_pi_gain" },
  { key: "master", label: "Master Multiplier", min: 0, max: 200, value: 100, cli: "simplified_master_multiplier" },
];

const filterSliderDefs = [
  { key: "gyro", label: "Gyro Filter Multiplier", min: 10, max: 200, value: 100, cli: "simplified_gyro_filter_multiplier" },
  { key: "dterm", label: "D-term Filter Multiplier", min: 10, max: 200, value: 100, cli: "simplified_dterm_filter_multiplier" },
];

const state = {
  pidMode: 2,
  dtermFilterEnabled: true,
  gyroFilterEnabled: true,
  sliders: Object.fromEntries(sliderDefs.map((slider) => [slider.key, slider.value])),
  filterSliders: Object.fromEntries(filterSliderDefs.map((slider) => [slider.key, slider.value])),
};

const axisOrder = ["roll", "pitch", "yaw"];
const axisLabels = { roll: "Roll", pitch: "Pitch", yaw: "Yaw" };

const sliderPanel = document.querySelector("#sliderPanel");
const filterPanel = document.querySelector("#filterPanel");
const pidTable = document.querySelector("#pidTable");
const dtermFilters = document.querySelector("#dtermFilters");
const gyroFilters = document.querySelector("#gyroFilters");
const cliOutput = document.querySelector("#cliOutput");
const copyStatus = document.querySelector("#copyStatus");
const sourceBadge = document.querySelector("#sourceBadge");
const modeHint = document.querySelector("#modeHint");

function constrain(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cInt(value) {
  return Math.trunc(value);
}

function percent(value) {
  return value / 100;
}

function multiplierLabel(value) {
  return (value / 100).toFixed(1);
}

function buildSlider(parent, def, bucket) {
  const row = document.createElement("div");
  row.className = "slider-row";

  const main = document.createElement("div");
  const label = document.createElement("div");
  label.className = "slider-label";
  label.innerHTML = `<strong>${def.label}</strong><span>${multiplierLabel(def.min)}-${multiplierLabel(def.max)}</span>`;

  const range = document.createElement("input");
  range.type = "range";
  range.min = def.min;
  range.max = def.max;
  range.step = 1;
  range.value = state[bucket][def.key];
  range.setAttribute("aria-label", def.label);

  const number = document.createElement("input");
  number.className = "number-input";
  number.type = "number";
  number.min = multiplierLabel(def.min);
  number.max = multiplierLabel(def.max);
  number.step = 0.1;
  number.value = multiplierLabel(state[bucket][def.key]);
  number.setAttribute("aria-label", `${def.label} value`);

  const update = (rawValue, fromNumber = false) => {
    const parsed = Number(rawValue) || 0;
    const value = constrain(fromNumber ? Math.round(parsed * 100) : parsed, def.min, def.max);
    state[bucket][def.key] = value;
    range.value = value;
    number.value = multiplierLabel(value);
    render();
  };

  range.addEventListener("input", (event) => update(event.target.value));
  number.addEventListener("input", (event) => update(event.target.value, true));

  main.append(label, range);
  row.append(main, number);
  parent.append(row);
}

function buildControls() {
  const title = document.createElement("div");
  title.className = "group-title";
  title.innerHTML = "<h2>PID Sliders</h2><span>0.0-2.0</span>";
  sliderPanel.append(title);
  sliderDefs.forEach((def) => buildSlider(sliderPanel, def, "sliders"));
  filterSliderDefs.forEach((def) => buildSlider(filterPanel, def, "filterSliders"));

  document.querySelectorAll("input[name='pidMode']").forEach((input) => {
    input.addEventListener("change", (event) => {
      state.pidMode = Number(event.target.value);
      render();
    });
  });

  document.querySelector("#dtermFilterEnabled").addEventListener("change", (event) => {
    state.dtermFilterEnabled = event.target.checked;
    render();
  });

  document.querySelector("#gyroFilterEnabled").addEventListener("change", (event) => {
    state.gyroFilterEnabled = event.target.checked;
    render();
  });

  document.querySelector("#resetButton").addEventListener("click", reset);
  document.querySelector("#copyButton").addEventListener("click", copyCli);
}

function calculatePids() {
  const s = state.sliders;
  const masterMultiplier = percent(s.master);
  const piGain = percent(s.pi);
  const dGain = percent(s.d);
  const feedforwardGain = percent(s.ff);
  const iGain = percent(s.i);

  return axisOrder.map((axis, index) => {
    const defaults = constants.pidDefaults[axis];
    const dMaxDefault = constants.dMaxDefaults[axis];
    const pitchDGain = axis === "pitch" ? percent(s.pitchD) : 1;
    const pitchPiGain = axis === "pitch" ? percent(s.pitchPi) : 1;
    const active = state.pidMode !== 0 && index <= state.pidMode;

    if (!active) {
      return { axis, active, ...defaults, dMax: dMaxDefault };
    }

    const dMaxGain = dMaxDefault > 0
      ? percent(s.dmax) + (1 - percent(s.dmax)) * defaults.D / dMaxDefault
      : 1;

    return {
      axis,
      active,
      P: constrain(cInt(defaults.P * masterMultiplier * piGain * pitchPiGain), 0, constants.pidGainMax),
      I: constrain(cInt(defaults.I * masterMultiplier * piGain * iGain * pitchPiGain), 0, constants.pidGainMax),
      D: constrain(cInt(defaults.D * masterMultiplier * dGain * pitchDGain), 0, constants.pidGainMax),
      F: constrain(cInt(defaults.F * masterMultiplier * pitchPiGain * feedforwardGain), 0, constants.fGainMax),
      dMax: constrain(cInt(dMaxDefault * masterMultiplier * dGain * pitchDGain * dMaxGain), 0, constants.pidGainMax),
    };
  });
}

function calculateFilters(defaults, multiplier, enabled) {
  if (!enabled) {
    return { ...defaults, active: false };
  }

  return {
    active: true,
    lpf1DynMin: constrain(Math.trunc(defaults.lpf1DynMin * multiplier / 100), 0, constants.dynLpfMaxHz),
    lpf1DynMax: constrain(Math.trunc(defaults.lpf1DynMax * multiplier / 100), 0, constants.dynLpfMaxHz),
    lpf1Static: constrain(Math.trunc(defaults.lpf1DynMin * multiplier / 100), 0, constants.dynLpfMaxHz),
    lpf2Static: constrain(Math.trunc(defaults.lpf2Static * multiplier / 100), 0, constants.lpfMaxHz),
  };
}

function valueClass(value, defaultValue, active = true) {
  if (!active) return "inactive";
  return value === defaultValue ? "" : "changed";
}

function renderPidTable(rows) {
  pidTable.innerHTML = rows.map((row) => {
    const defaults = constants.pidDefaults[row.axis];
    return `
      <tr>
        <td>${axisLabels[row.axis]}${row.active ? "" : " <span class=\"inactive\">unchanged</span>"}</td>
        <td class="${valueClass(row.P, defaults.P, row.active)}">${row.P}</td>
        <td class="${valueClass(row.I, defaults.I, row.active)}">${row.I}</td>
        <td class="${valueClass(row.D, defaults.D, row.active)}">${row.D}</td>
        <td class="${valueClass(row.dMax, constants.dMaxDefaults[row.axis], row.active)}">${row.dMax}</td>
        <td class="${valueClass(row.F, defaults.F, row.active)}">${row.F}</td>
      </tr>
    `;
  }).join("");
}

function renderFilterList(target, filters, defaults, labels) {
  target.innerHTML = labels.map(([key, label]) => `
    <dt>${label}</dt>
    <dd class="${valueClass(filters[key], defaults[key], filters.active)}">${filters[key]} Hz</dd>
  `).join("");
}

function cliLines(rows, dterm, gyro) {
  const lines = [
    `set simplified_pids_mode = ${state.pidMode}`,
    ...sliderDefs.map((def) => `set ${def.cli} = ${state.sliders[def.key]}`),
    `set simplified_dterm_filter = ${state.dtermFilterEnabled ? 1 : 0}`,
    ...filterSliderDefs.map((def) => `set ${def.cli} = ${state.filterSliders[def.key]}`),
    `set simplified_gyro_filter = ${state.gyroFilterEnabled ? 1 : 0}`,
    "",
  ];

  rows.forEach((row) => {
    lines.push(`set p_${row.axis} = ${row.P}`);
    lines.push(`set i_${row.axis} = ${row.I}`);
    lines.push(`set d_${row.axis} = ${row.D}`);
    lines.push(`set f_${row.axis} = ${row.F}`);
    lines.push(`set d_max_${row.axis} = ${row.dMax}`);
  });

  lines.push("");
  lines.push(`set dterm_lpf1_static_hz = ${dterm.lpf1Static}`);
  lines.push(`set dterm_lpf2_static_hz = ${dterm.lpf2Static}`);
  lines.push(`set dterm_lpf1_dyn_min_hz = ${dterm.lpf1DynMin}`);
  lines.push(`set dterm_lpf1_dyn_max_hz = ${dterm.lpf1DynMax}`);
  lines.push(`set gyro_lpf1_static_hz = ${gyro.lpf1Static}`);
  lines.push(`set gyro_lpf2_static_hz = ${gyro.lpf2Static}`);
  lines.push(`set gyro_lpf1_dyn_min_hz = ${gyro.lpf1DynMin}`);
  lines.push(`set gyro_lpf1_dyn_max_hz = ${gyro.lpf1DynMax}`);
  lines.push("save");

  return lines.join("\n");
}

function render() {
  const rows = calculatePids();
  const dterm = calculateFilters(constants.dtermDefaults, state.filterSliders.dterm, state.dtermFilterEnabled);
  const gyro = calculateFilters(constants.gyroDefaults, state.filterSliders.gyro, state.gyroFilterEnabled);

  modeHint.textContent = ["No PID changes", "Roll and pitch", "Roll, pitch, yaw"][state.pidMode];
  sourceBadge.textContent = isDefaultState() ? "BF defaults" : "modified";
  renderPidTable(rows);
  renderFilterList(dtermFilters, dterm, constants.dtermDefaults, [
    ["lpf1Static", "LPF1 static"],
    ["lpf2Static", "LPF2 static"],
    ["lpf1DynMin", "LPF1 dynamic min"],
    ["lpf1DynMax", "LPF1 dynamic max"],
  ]);
  renderFilterList(gyroFilters, gyro, constants.gyroDefaults, [
    ["lpf1Static", "LPF1 static"],
    ["lpf2Static", "LPF2 static"],
    ["lpf1DynMin", "LPF1 dynamic min"],
    ["lpf1DynMax", "LPF1 dynamic max"],
  ]);
  cliOutput.textContent = cliLines(rows, dterm, gyro);
}

function isDefaultState() {
  return state.pidMode === 2
    && state.dtermFilterEnabled
    && state.gyroFilterEnabled
    && sliderDefs.every((def) => state.sliders[def.key] === def.value)
    && filterSliderDefs.every((def) => state.filterSliders[def.key] === def.value);
}

function reset() {
  state.pidMode = 2;
  state.dtermFilterEnabled = true;
  state.gyroFilterEnabled = true;
  sliderDefs.forEach((def) => {
    state.sliders[def.key] = def.value;
  });
  filterSliderDefs.forEach((def) => {
    state.filterSliders[def.key] = def.value;
  });

  document.querySelector("input[name='pidMode'][value='2']").checked = true;
  document.querySelector("#dtermFilterEnabled").checked = true;
  document.querySelector("#gyroFilterEnabled").checked = true;
  document.querySelectorAll(".slider-row").forEach((row) => row.remove());
  document.querySelectorAll(".group-title + .slider-row").forEach((row) => row.remove());
  sliderPanel.querySelectorAll(".slider-row").forEach((row) => row.remove());
  filterPanel.querySelectorAll(".slider-row").forEach((row) => row.remove());
  sliderDefs.forEach((def) => buildSlider(sliderPanel, def, "sliders"));
  filterSliderDefs.forEach((def) => buildSlider(filterPanel, def, "filterSliders"));
  render();
}

async function copyCli() {
  try {
    await navigator.clipboard.writeText(cliOutput.textContent);
    copyStatus.textContent = "Copied";
  } catch {
    copyStatus.textContent = "Select text to copy";
  }
  setTimeout(() => {
    copyStatus.textContent = "";
  }, 1800);
}

buildControls();
render();
