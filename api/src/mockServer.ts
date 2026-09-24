process.env.MOCK_DATA = 'true';
process.env.DATABASE_URL ??= 'postgresql://mock:mock@localhost/mock';

await import('./server.js');
