import serverless from 'serverless-http';
import express, { Request, Response } from 'express';
import { uploadBase64ToS3 } from './utils';
import { pool } from "./db"
import { ResultSetHeader } from 'mysql2';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Ok',
  });
});

app.post('/upload', async (req: Request, res: Response) => {
  const { filename, data } = req.body as { filename?: string; data?: string };
  if (!filename || !data) {
    res.status(400).json({ error: 'Must provide filename and Base64 data' });
    return;
  }

  try {
    const url = await uploadBase64ToS3(filename, data);
    res.status(200).json({ message: 'Upload successful', url });
  } catch (error) {
    console.error('Error uploading to S3:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Alta de empleado
app.post('/api/empleados', async (req: Request, res: Response) => {
  const { nombre, departamento, foto } = req.body;
  if (!nombre || !departamento || !foto) {
    res.status(400).json({ error: 'Must provide nombre, departamento and foto' });
    return;
  }
  try {
    const foto_url = await uploadBase64ToS3(`${nombre}.jpg`, foto);
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO Empleado (nombre, departamento, foto_url) VALUES (?, ?, ?)',
      [nombre, departamento, foto_url]
    );
    res.json({ status: 'Empleado registrado', empleado: { id: result.insertId, nombre, departamento, foto_url } });
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
  const hora = new Date().getHours();
  let tipo = null;

  if (hora >= 6 && hora <= 10) tipo = 'desayuno';
  else if (hora >= 11 && hora <= 15) tipo = 'comida';
  else {
    res.status(400).json({ error: 'Fuera de horario' });
    return;
  }

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM Empleado WHERE empleado_id = ?', [numero_empleado]);
    if (!rows || rows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }

    await pool.query(
      'INSERT INTO Consumo (empleado_id, tipo_consumo, fecha_hora, precio) VALUES (?, ?, NOW(), ?)',
      [numero_empleado, tipo, tipo === 'desayuno' ? 30 : 50]
    );

    res.json({ status: 'Consumo registrado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el registro' });
  }
});


app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
  });
});

export const handler = serverless(app);
