export interface TileData {
  x: number;       // координата сетки (0..37)
  y: number;       // координата сетки (0..37)
  tileId: string;  // идентификатор тайла
  layer: number;   // 0 - пол, 1 - объект/декор, 2 - коллизия
}

export const ARINAR_MAP_TILES: TileData[] = [
  // Сюда будет вставляться сгенерированный редактором массив
];