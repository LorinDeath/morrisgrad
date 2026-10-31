// Клиентская заглушка tree-data.ts: в браузерной сборке деревьев нет вообще.
// Дерево игрок получает от сервера (state.tree, урезанное — ТЗ §14.F). Сборщик подменяет импорт "./tree-data" на этот файл.
import type { Tech } from "./econ-cfg";
import type { ChiefDef } from "./content-cfg";
export const TREE_DATA_FULL = false;
export const TECHS: Tech[] = [];
export const CHIEFS: ChiefDef[] = [];
export const TECH_NODE_ORDER: string[] = [];
export const TECH_RACE_NAMES: Record<string, string[]> = {};
export const TECH_RACE_FX: Record<string, Record<string, { eff: string; fx: Record<string, any> }>> = {};
export const ULTS: Record<string, any> = {};
export const ULT_OF: Record<string, string> = {};
export const UNIT_TREE: Record<string, any> = {};
export const UNIT_ULTS: Record<string, any> = {};
export const UNIT_RACE_NAMES: Record<string, Record<string, string>> = {};
