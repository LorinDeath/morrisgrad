// Карты миров: коллизии (как раньше, по тайлам сервера) + 3D-сборка тайлов.
// Тайлы по-прежнему берутся из server/maps/*.ts — тот же формат, что экспортирует MapEditor.
import { HELLFIRE_MAP_TILES } from '../../../../../server/maps/hellfireMap.ts';
import { ARINAR_MAP_TILES } from '../../../../../server/maps/arinarMap.ts';
import { PX, toX, toZ } from '../engine/geometry.js';

export class WorldMapManager {
  constructor(cellSize = 32) {
    this.cellSize = cellSize;
    this.currentWorld = 'hellfire';
    this.maps = {
      hellfire: HELLFIRE_MAP_TILES || [],
      arinar: ARINAR_MAP_TILES || [],
      sandbox: ARINAR_MAP_TILES || [],
    };
    this.solidGrid = new Set();
    this.version = 0;
    this.switchWorld('hellfire');
  }

  switchWorld(worldName) {
    this.currentWorld = worldName || 'hellfire';
    this.rebuildCollisions();
  }

  updateWorldTiles(worldName, tiles) {
    this.maps[worldName] = tiles || [];
    if (this.currentWorld === worldName) this.rebuildCollisions();
  }

  rebuildCollisions() {
    this.solidGrid.clear();
    (this.maps[this.currentWorld] || []).forEach((t) => {
      if (t.layer === 2 || t.tileId === 'collision_box') this.solidGrid.add(`${t.x}_${t.y}`);
    });
    this.version++;
  }

  isBlocked(worldX, worldY, padding = 10) {
    if (this.solidGrid.size === 0) return false;
    const c = this.cellSize;
    const minX = Math.floor((worldX - padding) / c), maxX = Math.floor((worldX + padding) / c);
    const minY = Math.floor((worldY - padding) / c), maxY = Math.floor((worldY + padding) / c);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        if (this.solidGrid.has(`${cx}_${cy}`)) return true;
      }
    }
    return false;
  }

  // 3D-представление тайлов текущего мира. Пересобирается при смене мира/правке карты.
  build3D(THREE, showCollision = false) {
    const group = new THREE.Group();
    group.name = 'tiles';
    const tiles = this.maps[this.currentWorld] || [];
    const cs = this.cellSize / PX; // 1.6 м
    const isHell = this.currentWorld === 'hellfire';
    const kinds = {
      floor_star: { color: isHell ? 0x2a1a40 : 0x1d2147, emissive: isHell ? 0x3b1d0a : 0x1e1b4b, h: 0.08 },
      platform_star: { color: isHell ? 0x34204f : 0x23275a, emissive: isHell ? 0x5a2d0c : 0x312e81, h: 0.14 },
      floor_void: { color: 0x0d0b18, emissive: 0x000000, h: 0.05 },
      floor_crystal: { color: 0x123456, emissive: 0x0c4a6e, h: 0.1 },
      other: { color: 0x181428, emissive: 0x000000, h: 0.06 },
    };
    const floors = {};
    const objects = [];
    const solids = [];
    tiles.forEach((t) => {
      if (t.layer === 0) {
        const k = kinds[t.tileId] ? t.tileId : 'other';
        (floors[k] = floors[k] || []).push(t);
      } else if (t.layer === 1) objects.push(t);
      else if (t.layer === 2 || t.tileId === 'collision_box') solids.push(t);
    });
    const dummy = new THREE.Object3D();
    Object.keys(floors).forEach((k) => {
      const list = floors[k];
      const def = kinds[k];
      const geo = new THREE.BoxGeometry(cs * 0.96, def.h, cs * 0.96);
      const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.emissive, emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.2, flatShading: true });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        dummy.position.set(toX(t.x * this.cellSize) + cs / 2, def.h / 2, toZ(t.y * this.cellSize) + cs / 2);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.receiveShadow = true;
      group.add(im);
    });
    objects.forEach((t) => {
      const x = toX(t.x * this.cellSize) + cs / 2;
      const z = toZ(t.y * this.cellSize) + cs / 2;
      if (t.tileId === 'column_rune') {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(cs * 0.3, cs * 0.36, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x1b132e, flatShading: true, roughness: 0.6 }));
        col.position.set(x, 1.3, z);
        col.castShadow = true;
        group.add(col);
        const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
        rune.position.set(x, 2.95, z);
        rune.userData.spin = true;
        group.add(rune);
      } else {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(cs, 1.8, cs), new THREE.MeshStandardMaterial({ color: 0x2d2244, emissive: 0x4f3b75, emissiveIntensity: 0.25, flatShading: true }));
        wall.position.set(x, 0.9, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);
      }
    });
    if (solids.length) {
      const geo = new THREE.BoxGeometry(cs, 1.0, cs);
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a2a4f, flatShading: true, transparent: showCollision, opacity: showCollision ? 0.55 : 1, emissive: showCollision ? 0xef4444 : 0x000000, emissiveIntensity: 0.4 });
      const im = new THREE.InstancedMesh(geo, mat, solids.length);
      solids.forEach((t, i) => {
        dummy.position.set(toX(t.x * this.cellSize) + cs / 2, 0.5, toZ(t.y * this.cellSize) + cs / 2);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.castShadow = true;
      group.add(im);
    }
    return group;
  }
}
