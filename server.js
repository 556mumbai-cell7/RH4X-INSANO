const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;
const SENHA = 'adm123';
const REDIS_URL = 'rediss://default:gQAAAAAABFwoAAIgcDI0ZjA5NDZmZDRlNGI0OWUyODYxYjg4NDViNjE4YmM3ZQ@evolving-moth-285736.upstash.io:6379';

app.use(cors());
app.use(express.json());

let redis = null;

async function conectarRedis() {
    redis = createClient({ url: REDIS_URL });
    redis.on('error', (err) => console.log('Erro Redis:', err));
    await redis.connect();
    console.log('CONECTOU NO REDIS!');
}

conectarRedis();

function criarCodigo() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bloco = () => {
        let s = '';
        for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
        return s;
    };
    return 'RH4X-' + bloco() + '-' + bloco() + '-' + bloco();
}

function admin(req, res, next) {
    const p = req.headers['x-senha'] || req.query.senha;
    if (p !== SENHA) return res.status(401).json({ erro: 'Acesso negado' });
    next();
}

app.get('/', (req, res) => {
    res.json({ sistema: 'RH4X INSANO @SAMUELDOSSCRIPTS', status: 'online', banco: redis && redis.isOpen ? 'redis-on' : 'redis-off' });
});

app.post('/gerar', admin, async (req, res) => {
    try {
        const horas = parseInt(req.body.horas) || 24;
        const nome = req.body.nome || ('Plano ' + horas + 'h');
        let codigo;
        let existe = true;
        while (existe) {
            codigo = criarCodigo();
            const check = await redis.get('key:' + codigo);
            existe = !!check;
        }
        const agora = Date.now();
        const dados = {
            key: codigo,
            criadaEm: agora,
            expiraEm: agora + (horas * 3600 * 1000),
            horas: horas,
            nome: nome,
            usada: false,
            ativadaEm: null,
            hwid: null
        };
        await redis.set('key:' + codigo, JSON.stringify(dados));
        await redis.sAdd('todas:keys', codigo);
        res.json({ sucesso: true, key: codigo, expiraEm: dados.expiraEm, horas: horas, nome: nome });
    } catch (e) {
        console.log(e);
        res.status(500).json({ erro: 'Erro no servidor' });
    }
});

app.get('/listar', admin, async (req, res) => {
    try {
        const codigos = await redis.sMembers('todas:keys');
        const lista = [];
        for (const c of codigos) {
            const d = await redis.get('key:' + c);
            if (d) lista.push(JSON.parse(d));
        }
        lista.sort((a, b) => b.criadaEm - a.criadaEm);
        res.json(lista);
    } catch (e) {
        console.log(e);
        res.status(500).json({ erro: 'Erro no servidor' });
    }
});

app.delete('/deletar/:key', admin, async (req, res) => {
    try {
        await redis.del('key:' + req.params.key);
        await redis.sRem('todas:keys', req.params.key);
        res.json({ sucesso: true });
    } catch (e) { res.status(500).json({ erro: 'Erro' }); }
});

app.delete('/limpar', admin, async (req, res) => {
    try {
        const codigos = await redis.sMembers('todas:keys');
        for (const c of codigos) await redis.del('key:' + c);
        await redis.del('todas:keys');
        res.json({ sucesso: true });
    } catch (e) { res.status(500).json({ erro: 'Erro' }); }
});

app.post('/validar', async (req, res) => {
    try {
        const key = req.body.key;
        const hwid = req.body.hwid;
        if (!key || !hwid) return res.json({ valida: false, mensagem: 'Dados incompletos' });
        const raw = await redis.get('key:' + key);
        if (!raw) return res.json({ valida: false, mensagem: 'Key nao encontrada' });
        const reg = JSON.parse(raw);
        if (reg.usada && reg.hwid !== hwid) return res.json({ valida: false, mensagem: 'Key ja utilizada' });
        const agora = Date.now();
        if (agora > reg.expiraEm) return res.json({ valida: false, mensagem: 'Key expirada' });
        if (reg.hwid && reg.hwid !== hwid) return res.json({ valida: false, mensagem: 'Key travada em outro dispositivo' });
        if (!reg.hwid) {
            reg.hwid = hwid;
            reg.usada = true;
            reg.ativadaEm = agora;
            await redis.set('key:' + key, JSON.stringify(reg));
        }
        const restante = Math.floor((reg.expiraEm - agora) / 1000);
        const h = Math.floor(restante / 3600);
        const m = Math.floor((restante % 3600) / 60);
        res.json({ valida: true, mensagem: 'Key valida! Restam ' + h + 'h ' + m + 'min', expiraEm: reg.expiraEm });
    } catch (e) {
        console.log(e);
        res.status(500).json({ valida: false, mensagem: 'Erro no servidor' });
    }
});

app.listen(PORT, () => {
    console.log('RH4X INSANO @SAMUELDOSSCRIPTS rodando na porta ' + PORT);
});
