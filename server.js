const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SENHA = 'adm123';
const ARQUIVO = path.join(__dirname, 'licencas.json');

app.use(cors());
app.use(express.json());

function ler() {
    try {
        if (!fs.existsSync(ARQUIVO)) return { keys: {} };
        return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    } catch (e) {
        return { keys: {} };
    }
}

function salvar(dados) {
    fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
}

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
    res.json({ sistema: 'RH4X INSANO', status: 'online' });
});

app.post('/gerar', admin, (req, res) => {
    const horas = parseInt(req.body.horas) || 24;
    const nome = req.body.nome || ('Plano ' + horas + 'h');
    const banco = ler();
    let codigo;
    do { codigo = criarCodigo(); } while (banco.keys[codigo]);
    const agora = Date.now();
    banco.keys[codigo] = {
        criadaEm: agora,
        expiraEm: agora + (horas * 3600 * 1000),
        horas: horas,
        nome: nome,
        usada: false,
        ativadaEm: null,
        hwid: null
    };
    salvar(banco);
    res.json({
        sucesso: true,
        key: codigo,
        expiraEm: banco.keys[codigo].expiraEm,
        horas: horas,
        nome: nome
    });
});

app.get('/listar', admin, (req, res) => {
    const banco = ler();
    const lista = Object.keys(banco.keys).map(k => Object.assign({ key: k }, banco.keys[k]));
    lista.sort((a, b) => b.criadaEm - a.criadaEm);
    res.json(lista);
});

app.delete('/deletar/:key', admin, (req, res) => {
    const banco = ler();
    if (banco.keys[req.params.key]) {
        delete banco.keys[req.params.key];
        salvar(banco);
        return res.json({ sucesso: true });
    }
    res.status(404).json({ erro: 'Não encontrada' });
});

app.delete('/limpar', admin, (req, res) => {
    salvar({ keys: {} });
    res.json({ sucesso: true });
});

app.post('/marcar', admin, (req, res) => {
    const banco = ler();
    const k = req.body.key;
    if (!banco.keys[k]) return res.status(404).json({ erro: 'Não encontrada' });
    banco.keys[k].usada = true;
    banco.keys[k].ativadaEm = Date.now();
    salvar(banco);
    res.json({ sucesso: true });
});

app.post('/validar', (req, res) => {
    const key = req.body.key;
    const hwid = req.body.hwid;
    if (!key || !hwid) {
        return res.json({ valida: false, mensagem: 'Dados incompletos' });
    }
    const banco = ler();
    const reg = banco.keys[key];
    if (!reg) return res.json({ valida: false, mensagem: 'Key não encontrada' });
    if (reg.usada && reg.hwid !== hwid) {
        return res.json({ valida: false, mensagem: 'Key já utilizada' });
    }
    const agora = Date.now();
    if (agora > reg.expiraEm) {
        return res.json({ valida: false, mensagem: 'Key expirada' });
    }
    if (reg.hwid && reg.hwid !== hwid) {
        return res.json({ valida: false, mensagem: 'Key travada em outro dispositivo' });
    }
    if (!reg.hwid) {
        reg.hwid = hwid;
        reg.usada = true;
        reg.ativadaEm = agora;
        salvar(banco);
    }
    const restante = Math.floor((reg.expiraEm - agora) / 1000);
    const h = Math.floor(restante / 3600);
    const m = Math.floor((restante % 3600) / 60);
    res.json({
        valida: true,
        mensagem: 'Key válida! Restam ' + h + 'h ' + m + 'min',
        expiraEm: reg.expiraEm
    });
});

app.listen(PORT, () => {
    console.log('RH4X INSANO rodando na porta ' + PORT);
});
