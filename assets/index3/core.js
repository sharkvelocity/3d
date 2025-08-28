// Core globals (preserve names/values) — from index3.html
const canvas = document.getElementById('renderCanvas');
let engine, scene, camera, skybox;

let moonLight, moonShadows, flashLight, flashShadows, uvLight, irLight, cloudMat, cloudScroll = 0;
let moonMesh = null, moonMat = null;
let hemiLight = null;

let houseLights = []; let housePower = true;

let player = { sanity:100, room:'Van', speedWalk:0.9, speedRun:1.8, running:false, god:false };
let controls = { forward:false, back:false, left:false, right:false };
let allowFly = false;

let houseRoot = null;
let doorMeshes = [];
let ghost = {
  mesh:null, target:null, speed:1.4, slowSpeed:0.9, fastSpeed:1.4, alive:true,
  anims:{ idle:null, walk:null },
  visible:false, hunting:false,
  nextStep:0, stepInterval:0.55, footAudible:18,
  isTwins:false, meshFast:null
};

// Cold breath FX
const BREATH_RANGE = 5.0;
let breath = { ps:null, anchor:null, pulse:0, cooldown:0 };

// Weather state + modifiers
let weather = {
  state:'Clear',
  rainPS:null,
  snowPS:null,
  snowTex:null,
  lightningTimer:0, nextStrike:0,
  modSanityDrain:1.0,
  modHuntChance:1.0,
  modHuntPace:1.0
};

// Van zone spawn (from your original)
let vanZone = { center: new BABYLON.Vector3(43.657, 2, -119.008), radius: 11 };

let storageOpen = false;
let dev = { enabled:false, gateOpen:false, log:[] };
let activeItemSlot = 1;

let inventory = {
  slots:{1:null,2:null,3:null,4:'Lighter',5:'Notebook'},
  models:{}, icons:{},
  slotCharges:{1:0,2:0,3:0,4:Infinity,5:Infinity}
};

const ITEM_DEFAULT_CHARGES = { 'Smudge':1, 'Salt':3 };
const devBus = new EventTarget();
let __devGhostLogTimer = 0;

const STORAGE_ITEMS = ['Flashlight','UV Light','Camera','EMF','Spirit Box','Thermometer','Crucifix','Salt','Smudge','D.O.T.S','Ghost Writing Book','Motion Sensor'];
const ITEM_MODEL_MAP = {
  'EMF':'EMF_Detector_EMF_Detector_0',
  'Spirit Box':'Cone.001_Spirit_Box_0',
  'Thermometer':'Thermometer_Thermometer_0',
  'Camera':'Photo_Camera_Photo_Camera_0',
  'UV Light':'Flashlight_Flashlight_0',
  'Flashlight':'Flashlight_Poquet_Flashlight_Poquet_0',
  'Thermal Camera':'Thermal_Camera_Thermal_Camera_0',
  'Voice Recorder':'Voice_Recorder_Voice_Recorder_0',
  'Ghost Writing Book':'(book-placeholder)',
  'D.O.T.S':'(dots-proj)',
  'Motion Sensor':'(motion-placeholder)'
};
const EVIDENCE_TYPES = ["EMF Level 5","Spirit Box","Fingerprints","Ghost Writing","Freezing Temps","D.O.T.S","Orbs"];
const GHOSTS = {
  spirit:["Spirit Box","Ghost Writing","EMF Level 5"],
  wraith:["Spirit Box","D.O.T.S","EMF Level 5"],
  poltergeist:["Spirit Box","Ghost Writing","Fingerprints"],
  banshee:["D.O.T.S","Fingerprints","Orbs"],
  jinn:["EMF Level 5","Freezing Temps","Fingerprints"],
  mare:["Spirit Box","Ghost Writing","Orbs"],
  revenant:["Ghost Writing","Orbs","Freezing Temps"],
  shade:["Ghost Writing","Freezing Temps","EMF Level 5"],
  demon:["Freezing Temps","Ghost Writing","Fingerprints"],
  yurei:["Freezing Temps","D.O.T.S","Orbs"],
  oni:["EMF Level 5","Freezing Temps","D.O.T.S"],
  yokai:["Spirit Box","D.O.T.S","Orbs"],
  hantu:["Freezing Temps","Ghost Writing","Fingerprints"],
  goryo:["EMF Level 5","D.O.T.S","Fingerprints"],
  myling:["Ghost Writing","EMF Level 5","Fingerprints"],
  onryo:["Freezing Temps","Spirit Box","Orbs"],
  "the twins":["Spirit Box","Freezing Temps","EMF Level 5"],
  raiju:["EMF Level 5","D.O.T.S","Orbs"],
  obake:["EMF Level 5","Orbs","Fingerprints"],
  "the mimic":["Spirit Box","Freezing Temps","Fingerprints"],
  moroi:["Freezing Temps","Ghost Writing","Spirit Box"],
  deogen:["Spirit Box","Ghost Writing","D.O.T.S"],
  thaye:["Ghost Writing","Orbs","D.O.T.S"],
  phantom:["Spirit Box","D.O.T.S","Fingerprints"],
  succubus:["Ghost Writing","Orbs","Spirit Box"]
};
let discoveredEvidence = new Set();
let currentGhostKey = null;

let ghostPolygon = [
  new BABYLON.Vector3(18.404, 0, -96.040),
  new BABYLON.Vector3(57.205, 0, -94.031),
  new BABYLON.Vector3(62.145, 0, -105.142),
  new BABYLON.Vector3(61.872, 0, -149.928),
  new BABYLON.Vector3(18.660, 0, -149.900)
];

// Placeables / rules
const CRUCIFIX_BASE_RADIUS = 3.0;
const CRUCIFIX_DEMON_RADIUS = 5.0;
const TWINS_SEP_MIN = 10.0, TWINS_SEP_MAX = 12.0;

const placeables = { motionSensors: [], crucifixes: [] };

// Simple shorthands
function $(s){ return document.querySelector(s); }
