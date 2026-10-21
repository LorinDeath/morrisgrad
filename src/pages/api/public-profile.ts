import type { APIRoute } from 'astro';
import { publicProfileResponse } from '../../lib/api/publicProfile';

// Публичный профиль любого игрока (без входа): только публичные поля — src/lib/api/profileFields.ts
export const GET: APIRoute = async ({ request, locals }) => publicProfileResponse(request, locals);
