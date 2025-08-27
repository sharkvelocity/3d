/* ============================================================================
   pp_runtime.js — Phasma-Phoney master runtime (Env + Bounds + Salt/EMF +
                   Influence + Phantom/Wraith Teleport + Hooks)
   Namespace: window.PP

   Design:
   - Non-invasive: it won’t overwrite your systems. You opt-in via PP.Runtime.
   - Hard rule: Ghosts cannot leave the house interior polygon.
   - Teleport: Only Phantom & Wraith; always emits EMF-2 buzz on teleport.
   - Salt: Phantom can leave footprints if landing on salt; Wraith never does.
   - Influence: Returns multipliers; auto-speed scaling is opt-in.

   Integration (quick):
   ---------------------------------------------------------------------------
   <script src="./assets/dev/util/pp_runtime.js"></script>
   // After scene + player exist:
   PP.Runtime.setScene(scene).setPlayer(player);
   PP.Bounds.setPolygon(MAP_DEF?.interior || [{x:-15,z:-20},{x:15,z:-20},{x:15,z:20},{x:-15,z:20}]);
   // Optional providers
   PP.Env
     .setProvider('countActiveElectronicsWithin', (pos,r)=>0)
     .setProvider('countFireSourcesWithin', (pos,r)=>0)
     .setProvider('getRoomIdFor', (pos)=>'default');
   // Optional toggles:
   PP.Runtime.configure({ APPLY_INFLUENCE:false, DEBUG_BOUNDS:false });

   // For each ghost:
   PP.Runtime.registerGhost(ghost);

   // Each frame:
   const dt = engine.getDeltaTime()*0.001;
   PP.Runtime.onTick(dt);
   ---------------------------------------------------------------------------
============================================================================ */

(function(){
  const PP = window.PP = window.PP || {};

  // -------------------------- Utilities -----------------------------------
  function clamp(v,a,b){ return Math.min(Math.max(v,a),b); }
  function rand(a,b){ return a + Math.random()*(b-a); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function distance2D(a,b){ return Math.hypot((a.x||0)-(b.x||0), (a.z||0)-(b.z||0)); }

  // ---------------------- Environmental State ------------------------------
  const Env = {
    breakerOn: false,
    rooms: new Map(),                 // roomId -> { tempC, lightsOn, hasFire, electronicsActive, noise, isExterior }
    weather: { type:"clear", rain:0, fog:0, wind:0, moonlight:0.6 },
    electronicsNearGhost: 0,
    electronicsNearPlayer: 0,
    crucifixCountInRoom: 0,
    fireNearPlayer: 0,
    illum: new Map(),
    timeSec: 0,
    providers: {
      countActiveElectronicsWithin: null, // (pos, radius) -> int
      countFireSourcesWithin: null,       // (pos, radius) -> int
      getRoomIdFor: null,                 // (pos) -> roomId
    },
    setProvider(name, fn){ this.providers[name] = fn; return this; },

    tick(dt, scene, player){
      this.timeSec += dt;
      // electronics probe
      if (this.providers.countActiveElectronicsWithin && scene && player){
        if ((this._elecT = (this._elecT||0) + dt) > 1.0){
          this._elecT = 0;
          const ghost = (PP.Runtime && PP.Runtime._firstGhost()) || null;
          if (ghost){
            this.electronicsNearGhost =
              this.providers.countActiveElectronicsWithin(ghost.mesh.position, 12) | 0;
          }
          const ppos = (player.position || player.mesh?.position || {x:0,z:0});
          this.electronicsNearPlayer =
            this.providers.countActiveElectronicsWithin(ppos, 12) | 0;
        }
      }
      // fire probe
      if (this.providers.countFireSourcesWithin && player){
        if ((this._fireT = (this._fireT||0) + dt) > 0.75){
          this._fireT = 0;
          const ppos = (player.position || player.mesh?.position || {x:0,z:0});
          this.fireNearPlayer =
            this.providers.countFireSourcesWithin(ppos, 7) | 0;
        }
      }
      // cheap thermal drift
      if ((this._thermalT = (this._thermalT||0) + dt) > 1.0){
        this._thermalT = 0;
        for (const [id,r] of this.rooms){
          let target = 18;
          if (!this.breakerOn) target -= 2;
          if (r.hasFire) target += 3;
          if (this.weather.fog>0.5 || this.weather.rain>0.5) target -= 1;
          r.tempC = r.tempC ?? 18;
          r.tempC += (target - r.tempC) * 0.02;
          this.rooms.set(id, r);
        }
      }
    }
  };
  PP.Env = Env;

  // ------------------------- House Bounds ----------------------------------
  const Bounds = {
    polygon: [ {x:-15,z:-20},{x:15,z:-20},{x:15,z:20},{x:-15,z:20} ],
    _aabb: {minX:-15,maxX:15,minZ:-20,maxZ:20},

    setPolygon(poly){
      this.polygon = poly.slice();
      const xs = poly.map(p=>p.x), zs = poly.map(p=>p.z);
      this._aabb = {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minZ: Math.min(...zs), maxZ: Math.max(...zs)
      };
      return this;
    },
    pointInPolyXZ(p){
      const poly = this.polygon;
      let inside=false;
      for (let i=0,j=poly.length-1;i<poly.length;j=i++){
        const xi=poly[i].x, zi=poly[i].z, xj=poly[j].x, zj=poly[j].z;
        const intersect=((zi>p.z)!==(zj>p.z)) && (p.x < (xj-xi)*(p.z-zi)/((zj-zi)||1e-9)+xi);
        if (intersect) inside=!inside;
      }
      return inside;
    },
    _closestPointOnSegmentXZ(ax,az,bx,bz,px,pz){
      const abx=bx-ax, abz=bz-az, apx=px-ax, apz=pz-az;
      const ab2=abx*abx+abz*abz||1e-9;
      let t=(apx*abx+apz*abz)/ab2; t=Math.max(0,Math.min(1,t));
      return {x:ax+abx*t, z:az+abz*t};
    },
    _closestPointOnPolyXZ(p){
      const poly = this.polygon;
      let best=null,bestD2=Infinity;
      for (let i=0,j=poly.length-1;i<poly.length;j=i++){
        const a=poly[j], b=poly[i];
        const c=this._closestPointOnSegmentXZ(a.x,a.z,b.x,b.z,p.x,p.z);
        const dx=c.x-p.x, dz=c.z-p.z, d2=dx*dx+dz*dz;
        if (d2<bestD2){bestD2=d2;best=c;}
      }
      return best;
    },
    clampInside(pos, skin=0.06){
      if (this.pointInPolyXZ(pos)) return pos;
      const c=this._closestPointOnPolyXZ(pos);
      const centroid = this.polygon.reduce((a,v)=>({x:a.x+v.x,z:a.z+v.z}),{x:0,z:0});
      centroid.x/=this.polygon.length; centroid.z/=this.polygon.length;
      const dirx=centroid.x-c.x, dirz=centroid.z-c.z;
      const len=Math.hypot(dirx,dirz)||1;
      return {x:c.x+(dirx/len)*skin, y:pos.y, z:c.z+(dirz/len)*skin};
    },
    enforceGhostHouseBounds(ghost){
      if (!ghost || !ghost.mesh) return;
      const p = {x:ghost.mesh.position.x, y:ghost.mesh.position.y, z:ghost.mesh.position.z};
      const clamped = this.clampInside(p);
      if (p.x!==clamped.x || p.z!==clamped.z){
        ghost.mesh.position.x=clamped.x; ghost.mesh.position.z=clamped.z;
        if (ghost.velocity){ ghost.velocity.x*=0.2; ghost.velocity.z*=0.2; }
      }
    }
  };
  PP.Bounds = Bounds;

  // ------------------------ Salt + EMF Shims --------------------------------
  const Salt = {
    // items: {type:'disc', c:{x,z}, r} OR {type:'line', a:{x,z}, b:{x,z}}
    lines: [],
    clear(){ this.lines.length = 0; },
    addDisc(x,z,r){ this.lines.push({type:'disc', c:{x:x,z:z}, r:r}); },
    addLine(ax,az,bx,bz){ this.lines.push({type:'line', a:{x:ax,z:az}, b:{x:bx,z:bz}}); },

    _closestPointOnSegmentXZ(ax,az,bx,bz,px,pz){
      const abx=bx-ax, abz=bz-az, apx=px-ax, apz=pz-az;
      const ab2=abx*abx+abz*abz||1e-9;
      let t=(apx*abx+apz*abz)/ab2; t=Math.max(0,Math.min(1,t));
      return {x:ax+abx*t, z:az+abz*t};
    },
    isPointOnSalt(x,z, tol=0.25){
      for (const s of this.lines){
        if (s.type==='disc'){
          const dx=x-s.c.x, dz=z-s.c.z; if (dx*dx+dz*dz <= s.r*s.r) return true;
        } else {
          const c=this._closestPointOnSegmentXZ(s.a.x,s.a.z, s.b.x,s.b.z, x,z);
          if (Math.hypot(c.x-x, c.z-z) <= tol) return true;
        }
      }
      return false;
    },
    leaveFootprintAt(x,z){
      if (PP.Events && PP.Events.spawnUVFootprint){
        PP.Events.spawnUVFootprint({x:x, z:z});
      } else {
        (console.debug||console.log)('[PP.Salt] Footprint at', x.toFixed(2), z.toFixed(2));
      }
    }
  };
  PP.Salt = Salt;

  const EMF = {
    spawn(opts){
      if (window.EMF && typeof window.EMF.spawn==='function'){
        window.EMF.spawn(opts);
      } else {
        (console.debug||console.log)('[PP.EMF] Pulse L'+opts.level, opts.position, 'src=',opts.source);
      }
    },
    emitTeleportBuzz(level, worldPos, duration=1.8){
      this.spawn({
        level: level|0, position: {...worldPos}, ttl: duration, source:'teleport'
      });
    }
  };
  PP.EMF = EMF;

  // -------------------- Environmental Influence -----------------------------
  const Influence = {
    compute(ghost, roomId){
      const r = Env.rooms.get(roomId) || {
        tempC:18, lightsOn:false, hasFire:false, electronicsActive:false, noise:0, isExterior:false
      };
      const out = {
        breakerOn: Env.breakerOn,
        tempC: r.tempC,
        lightsOn: Env.breakerOn && r.lightsOn,
        fireNearby: r.hasFire || Env.fireNearPlayer>0,
        electronicsBoost: (r.electronicsActive?1:0) + (ghost.isNearPlayer && Env.electronicsNearPlayer>0 ? 1:0),
        noise: r.noise, exterior: r.isExterior,
        speedMul:1, huntBias:1, eventBias:1, sanityDrainMul:1, visibilityBias:1
      };
      switch (ghost.type){
        case 'Jinn':
          if (out.breakerOn && ghost.distanceToPlayer>3){ out.speedMul*=1.15; out.huntBias*=1.1; }
          break;
        case 'Hantu':
          const cold=Math.max(0,(18-out.tempC))*0.02; out.speedMul*=(1+cold);
          if (out.fireNearby) out.speedMul*=0.9;
          break;
        case 'Onryo':
          if (out.fireNearby) out.huntBias*=0.5;
          break;
        case 'Raiju':
          if (out.electronicsBoost>0){ out.speedMul*=1.35; out.huntBias*=1.15; }
          break;
        case 'Mare':
          if (!out.lightsOn){ out.eventBias*=1.25; out.huntBias*=1.1; } else { out.eventBias*=0.8; out.huntBias*=0.9; }
          break;
        case 'Shade':
          if (ghost.sameRoomAsPlayer){ out.eventBias*=0.2; out.huntBias*=0.6; }
          if (out.lightsOn) out.eventBias*=0.8;
          break;
        case 'Goryo':
          out.visibilityBias *= out.lightsOn?0.6:1.0;
          break;
      }
      if (Env.weather.fog>0.4 && out.exterior) out.sanityDrainMul*=1.1;
      if (Env.weather.rain>0.6 && out.exterior) out.eventBias*=1.1;

      out.speedMul = clamp(out.speedMul, 0.6, 1.6);
      out.eventBias = clamp(out.eventBias, 0.5, 1.6);
      out.huntBias  = clamp(out.huntBias , 0.5, 1.6);
      return out;
    }
  };
  PP.Influence = Influence;

  // ---------------- Phantom/Wraith Teleport Manager -------------------------
  const Teleport = {
    minCD: 18, maxCD: 36,
    closeBiasMeters: 8, farBiasMeters: 16,
    _state: new WeakMap(),
    _pickTarget(playerPos){
      const box = Bounds._aabb;
      if (Math.random() < 0.5){
        const ang=Math.random()*Math.PI*2, r=rand(2, this.closeBiasMeters);
        return { x: playerPos.x + Math.cos(ang)*r, z: playerPos.z + Math.sin(ang)*r };
      } else {
        for (let i=0;i<30;i++){
          const rx = lerp(box.minX, box.maxX, Math.random());
          const rz = lerp(box.minZ, box.maxZ, Math.random());
          const p = {x:rx, z:rz};
          if (Bounds.pointInPolyXZ(p)) return p;
        }
        return { x: playerPos.x, z: playerPos.z };
      }
    },
    try(ghost, playerPos, dt){
      if (!ghost || !ghost.mesh) return;
      if (!(ghost.type==='Phantom' || ghost.type==='Wraith')) return;

      let st = this._state.get(ghost);
      if (!st){ st = { cd: rand(this.minCD, this.maxCD), lastPos: {x:ghost.mesh.position.x, y:ghost.mesh.position.y, z:ghost.mesh.position.z} }; }
      st.cd -= dt;
      if (st.cd > 0){ this._state.set(ghost, st); return; }

      const target = this._pickTarget(playerPos);
      const clamped = Bounds.clampInside({x:target.x, y:ghost.mesh.position.y, z:target.z});

      // Optional: cancel if a crucifix is very near the target and player
      if (Env.crucifixCountInRoom>0 && distance2D(clamped, playerPos) < 3.2){
        st.cd = rand(6,12);
        this._state.set(ghost, st);
        return;
      }

      ghost.mesh.position.x = clamped.x;
      ghost.mesh.position.z = clamped.z;

      const onSalt = Salt.isPointOnSalt(clamped.x, clamped.z);
      if (ghost.type==='Phantom'){ if (onSalt) Salt.leaveFootprintAt(clamped.x, clamped.z); }
      // Wraith: never leaves footprints

      EMF.emitTeleportBuzz(2, ghost.mesh.position, 2.0);

      st.cd = rand(this.minCD, this.maxCD);
      st.lastPos = {x:clamped.x, y:ghost.mesh.position.y, z:clamped.z};
      this._state.set(ghost, st);
    }
  };
  PP.Teleport = Teleport;

  // ---------------------------- Hooks / Runtime -----------------------------
  const Config = { APPLY_INFLUENCE:false, DEBUG_BOUNDS:false };

  const Runtime = {
    _ghosts: [],
    _player: null,
    _scene: null,
    _dbgEl: null,

    configure(opts){ Object.assign(Config, opts||{}); return this; },
    setScene(scene){ this._scene = scene; return this; },
    setPlayer(player){ this._player = player; return this; },
    registerGhost(ghost){ if (ghost && this._ghosts.indexOf(ghost)===-1) this._ghosts.push(ghost); return this; },
    _firstGhost(){ return this._ghosts[0] || null; },

    _ensureDebug(){
      if (!Config.DEBUG_BOUNDS) return;
      if (!this._dbgEl){
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:8px;bottom:8px;font:12px monospace;color:#0ff;background:rgba(0,0,0,.45);padding:6px 8px;border:1px solid #0ff;z-index:99999';
        document.body.appendChild(el);
        this._dbgEl = el;
      }
    },

    onTick(dt){
      if (!this._player) return;

      this._ensureDebug();
      PP.Env.tick(dt, this._scene, this._player);

      const playerPos = (this._player.mesh?.position || this._player.position || {x:0,z:0});

      for (const ghost of this._ghosts){
        // Room ID via provider (or ghost.roomId fallback)
        const getRoomIdFor = PP.Env.providers.getRoomIdFor;
        const roomId = (typeof getRoomIdFor==='function')
          ? getRoomIdFor(ghost.mesh.position)
          : (ghost.roomId ?? 'default');

        // Influence (you can also ignore these and use your own logic)
        const infl = PP.Influence.compute(ghost, roomId);
        if (Config.APPLY_INFLUENCE){
          const base = ghost.baseSpeed || 1.7;
          ghost.speed = clamp(base * infl.speedMul, 0.4, 3.8);
        }

        // Hard: ghost cannot leave house
        PP.Bounds.enforceGhostHouseBounds(ghost);

        // Teleport rules (Phantom/Wraith only)
        PP.Teleport.try(ghost, playerPos, dt);

        if (this._dbgEl){
          const inside = PP.Bounds.pointInPolyXZ(ghost.mesh.position);
          this._dbgEl.textContent = `Ghost@(${ghost.mesh.position.x.toFixed(2)},${ghost.mesh.position.z.toFixed(2)}) inside=${inside?'YES':'NO'}`;
        }
      }
    }
  };

  PP.Runtime = Runtime;
  PP.Config  = Config;
})();
