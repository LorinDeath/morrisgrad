import type { APIRoute } from 'astro';
import { currentUserResponse } from '../../lib/api/currentUser';

// Только свой профиль: пользователь — из проверенной сессии Clerk, ?userId= и прочие параметры игнорируются (src/lib/api/currentUser.ts)
export const GET: APIRoute = async ({ locals }) => currentUserResponse(locals);
