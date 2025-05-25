import serverless from 'serverless-http';
import express, { Request, Response } from 'express';
import { uploadBase64ToS3 } from './utils';
import { pool } from "./db";
import { ResultSetHeader } from 'mysql2';

const app = express();

app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Ok' });
});

// Alta de empleado
app.post('/api/empleados', async (req: Request, res: Response) => {
  const { nombre, departamento, foto } = req.body;

  if (!nombre || !departamento || !foto) {
    res.status(400).json({ error: 'Must provide nombre, departamento and foto' });
    return;
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO Empleado (nombre, departamento, foto_url) VALUES (?, ?, ?)',
      [nombre, departamento, '']
    );

    const id = result.insertId;
    const foto_url = await uploadBase64ToS3(`${id}-${nombre}.jpg`, foto);
    await pool.query('UPDATE Empleado SET foto_url = ? WHERE empleado_id = ?', [foto_url, id]);

    res.json({ status: 'Empleado registrado', empleado: { id, nombre, departamento, foto_url } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar empleado' });
  }
});

// Registro de consumo
app.post('/api/consumos', async (req: Request, res: Response): Promise<void> => {
  const { numero_empleado } = req.body;

  if (!numero_empleado) {
    res.status(400).json({ error: 'Must provide numero_empleado' });
    return;
  }

  try {
    const [empleadoRows] = await pool.query<any[]>('SELECT * FROM Empleado WHERE empleado_id = ?', [numero_empleado]);
    if (!empleadoRows || empleadoRows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }

    const [spResult] = await pool.query<any[]>('CALL GetTipoConsumo()');
    const { descripcion, precio } = spResult[0][0];

    if (descripcion === 'Fuera de servicio') {
      res.status(403).json({ error: 'Fuera de horario de servicio' });
      return;
    }

    await pool.query(
      'INSERT INTO Consumo (empleado_id, tipo_consumo, fecha_hora, precio) VALUES (?, ?, NOW(), ?)',
      [numero_empleado, descripcion, precio]
    );

    res.json({
      status: 'Consumo registrado',
      consumo: {
        empleado_id: numero_empleado,
        tipo_consumo: descripcion,
        precio,
        fecha: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el registro' });
  }
});

// 🔽 GET: Consumos del día actual
app.get('/api/consumos/dia', async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<any[][]>('CALL GetConsumosDelDia();');
    res.status(200).json({ ConsumosDelDia: rows[0] });
  } catch (err) {
    console.error('❌ ERROR en /api/consumos/dia:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});



app.get('/api/consumos/dia/:fecha', async (req: Request, res: Response): Promise<void> => {
  const fecha = req.params.fecha;

  if (!fecha) {
    res.status(400).json({ error: 'Parámetro "fecha" requerido (YYYY-MM-DD)' });
    return;
  }

  try {
    const [rows] = await pool.query<any[][]>('CALL GetConsumosDiaEspecifico(?)', [fecha]);
    res.status(200).json({ ConsumosDelDia: rows[0] });
  } catch (err) {
    console.error('❌ ERROR en /api/consumos/dia/:fecha:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// 🔽 GET: Consumos por mes específico (YYYY-MM-DD)
app.get('/api/consumos/mes/:fecha', async (req: Request, res: Response): Promise<void> => {
  const fecha = req.params.fecha;

  if (!fecha) {
    res.status(400).json({ error: 'Parámetro "fecha" requerido (YYYY-MM-DD)' });
    return;
  }

  try {
    const [rows] = await pool.query<any[][]>('CALL GetConsumosMes(?)', [fecha]);
    res.status(200).json({ ConsumosDelMes: rows[0] });
  } catch (err) {
    console.error('❌ ERROR en /api/consumos/mes/:fecha:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export const handler = serverless(app);
