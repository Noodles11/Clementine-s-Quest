// Global constants shared by simulation and rendering.

export const VIEW_W = 960;
export const VIEW_H = 540;

export const TILE = 48;
/** Tiles per room cell (one screen). */
export const CELL_W = 28;
export const CELL_H = 15;
/** Camera zoom: rooms are ~2x the area of a screen at 1:1; creatures keep their world size. */
export const ZOOM = 0.714;
/** Door mouth centre row/column within a cell. */
export const DOOR_ROW = 7;
export const DOOR_COL = 14;
export const CELL_PX_W = CELL_W * TILE; // 960
export const CELL_PX_H = CELL_H * TILE; // 528

/** Grid size of a floor layout. */
export const FLOOR_GRID = 13;

/** Simulation step. */
export const DT = 1 / 60;

/** Deepest depth playable in this version. */
export const MAX_DEPTH_V1 = 7;

export const FONT_TITLE = 'Rajdhani, "Segoe UI", sans-serif';
export const FONT_UI = 'Rajdhani, "Segoe UI", sans-serif';
