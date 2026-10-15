// Importar primero: los demás módulos leen process.env al cargarse
try { process.loadEnvFile(); } catch { /* sin .env: se usan las variables del sistema */ }
