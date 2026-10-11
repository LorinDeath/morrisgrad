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
      // Аринар теперь 2400×2400 с биомами (terrain.js); старая 1200-раскладка тайлов не используется
      arinar: [],
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
    let solids = [];
    tiles.forEach((t) => {
      if (t.layer === 0) {
        if (this.drawFloors) { const k = kinds[t.tileId] ? t.tileId : 'other'; (floors[k] = floors[k] || []).push(t); }
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
    // объекты: колонны-руны и руины стен — инстансами (1–2 вызова отрисовки на тип)
    const cols = objects.filter((t) => t.tileId === 'column_rune');
    const walls = objects.filter((t) => t.tileId !== 'column_rune');
    const at = (t) => [toX(t.x * this.cellSize) + cs / 2, toZ(t.y * this.cellSize) + cs / 2];
    if (cols.length && showCollision) {
      const colIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(cs * 0.3, cs * 0.36, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x1b132e, flatShading: true, roughness: 0.6 }), cols.length);
      const runeIm = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: isHell ? 0xf472b6 : 0x67e8f9 }), cols.length);
      cols.forEach((t, i) => {
        const [x, z] = at(t);
        dummy.position.set(x, 1.3, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); colIm.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, 2.95, z); dummy.updateMatrix(); runeIm.setMatrixAt(i, dummy.matrix);
      });
      colIm.castShadow = true;
      group.add(colIm, runeIm);
    }
    if (walls.length && showCollision) {
      const wallIm = new THREE.InstancedMesh(new THREE.BoxGeometry(cs, 1, cs), new THREE.MeshStandardMaterial({ color: isHell ? 0x2a2133 : 0x26245a, emissive: isHell ? 0x1a0f24 : 0x1e1b4b, emissiveIntensity: 0.3, flatShading: true, roughness: 0.9 }), walls.length);
      walls.forEach((t, i) => {
        const [x, z] = at(t);
        // руины: высота «ломаная», детерминированная от координат
        const h = 0.6 + (((t.x * 7 + t.y * 13) % 5) / 4) * 1.1;
        dummy.position.set(x, h / 2, z); dummy.rotation.set(0, ((t.x * 3 + t.y) % 3 - 1) * 0.06, 0); dummy.scale.set(0.96, h, 0.9); dummy.updateMatrix();
        wallIm.setMatrixAt(i, dummy.matrix);
      });
      wallIm.castShadow = true; wallIm.receiveShadow = true;
      group.add(wallIm);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    }
    // коллизии под объектами уже нарисованы самими объектами
    // в игре руины/колонны рисуются пиксельными пропсами (terrain.js); 3D-коробки — только в режиме показа коллизий
    if (!showCollision) return group;
    const objKeys = new Set(objects.map((t) => `${t.x}_${t.y}`));
    solids = solids.filter((t) => !objKeys.has(`${t.x}_${t.y}`));
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
