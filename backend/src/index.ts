import express from 'express';
import cors from 'cors';
import { analyze } from './routes/analyze';
import { summary } from './routes/summary';
import { config as configRoute } from './routes/config';


const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/analyze', analyze);
app.use('/api/summary', summary);
app.use('/api/config', configRoute);
app.get('/health', (_, res) => res.json({ ok: true }));


app.listen(process.env.PORT || 4000, () =>
  console.log(`API on http://localhost:${process.env.PORT || 4000}`)
);
