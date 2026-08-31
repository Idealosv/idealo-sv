# Entorno DEMO para agencias

El modo DEMO de IDEALO SV permite crear una empresa aislada para que una agencia de publicidad evalúe el ERP sin utilizar la operación real del proveedor del sistema.

## Reglas del entorno

- Cada agencia demo es una empresa independiente y conserva el aislamiento multiempresa existente.
- El acceso demo tiene fecha de vencimiento controlada desde el Panel Maestro.
- Las empresas demo se identifican visualmente con la etiqueta `DEMO`.
- Las empresas demo no se contabilizan dentro del MRR real.
- DTE de PRODUCCIÓN queda bloqueado a nivel de PostgreSQL para una empresa demo, incluso si el usuario tiene rol `owner`.
- `block_external_email` deja preparada la política para impedir envíos externos cuando se conecte la guardia de correo demo.
- Los datos reales de otras empresas siguen protegidos por `company_id`, membresía y RLS.

## Flujo comercial recomendado

1. Entrar a `/master` con una cuenta de administración de plataforma.
2. Crear la agencia y mantener activada la opción **Entorno DEMO seguro**.
3. Elegir el plan, rubro y número de días de prueba.
4. La persona invitada recibe acceso únicamente a la empresa creada para su evaluación.
5. Al convertir la prueba en cliente se debe revisar su configuración fiscal antes de habilitar cualquier operación de producción.

## Próxima etapa

Agregar un paquete de datos ficticios reiniciable para publicidad: clientes, productos, cotizaciones, órdenes de trabajo, producción, inventario, cobros y reportes. Los datos de demostración no deben copiarse desde ninguna empresa real.
