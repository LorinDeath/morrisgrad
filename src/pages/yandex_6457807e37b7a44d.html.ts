// Подтверждение прав в Яндекс Вебмастере. Отдаётся воркером (а не файлом из public/), потому что
// Cloudflare Assets перенаправляет любые *.html на адрес без .html (307), а Яндексу нужен ровно 200 по этому адресу.
export const prerender = false;
const BODY = `<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>Verification: 6457807e37b7a44d</body>
</html>`;
export const GET = () => new Response(BODY, { status: 200, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "public, max-age=3600" } });
export const HEAD = () => new Response(null, { status: 200, headers: { "content-type": "text/html; charset=UTF-8" } });
