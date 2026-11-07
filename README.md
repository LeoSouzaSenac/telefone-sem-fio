# Telefone de Rabiscos 🎨

Jogo de telefone sem fio com desenhos, multiplayer em tempo real, inspirado no gênero de jogos de desenho e adivinhação. Projeto independente: **não é o Gartic Phone oficial**.

## O que já funciona

- Criar sala privada e compartilhar por código ou URL
- 2 a 10 participantes por partida, cada um no celular ou computador
- Escrever frases, desenhar sobre tela touch ou mouse, adivinhar desenhos
- Pincel, cores, borracha, tamanho do traço, desfazer e limpar
- Cada participante recebe uma cadeia diferente a cada rodada
- Revelação de todas as histórias no final
- Timer de 150 segundos por turno; a rodada avança quando todos enviam ou quando o tempo expira
- Reconexão com identificador salvo no navegador
- Nova partida usando a mesma sala

## Executar localmente

Instale **Node.js 20 ou superior**. Abra **dois terminais**.

**Terminal 1 — servidor:**

```bash
cd server
npm install
npm run dev
```

**Terminal 2 — frontend:**

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

No Windows, basta criar `client/.env` manualmente com a linha:

```env
VITE_SERVER_URL=http://localhost:3001
```

Acesse http://localhost:5173. Para testes em dispositivos diferentes, todos precisam alcançar o endereço do servidor e do frontend: `localhost` só funciona no próprio dispositivo. Para testar com colegas, publique ambos na nuvem, seguindo abaixo.

## Publicar no Render (backend)

1. Suba **todo o projeto** em um único repositório GitHub.
2. No Render, selecione **New > Web Service**, vinculando o repositório.
3. Configure:
   - **Root directory:** `server`
   - **Environment:** `Node`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment variable:** `CLIENT_ORIGIN=https://SEU-PROJETO.vercel.app`
4. Após publicar, guarde a URL pública, por exemplo `https://meu-rabiscos.onrender.com`.
5. Teste `https://meu-rabiscos.onrender.com/health`, que deve responder `{"ok":true,...}`.

**Importante:** instâncias gratuitas do Render podem dormir quando não há acesso, causando uma demora inicial. O servidor armazena salas **em memória**; reiniciar o Render apaga salas e partidas ativas. Use **uma instância** do backend. A opção de persistência em banco (Redis, por exemplo) fica para uma versão futura.

## Publicar na Vercel (frontend)

1. Importe o mesmo repositório na Vercel.
2. Configure:
   - **Root directory:** `client`
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Environment variable:** `VITE_SERVER_URL=https://meu-rabiscos.onrender.com` (substitua pela sua URL real do Render).
3. Publique e abra o endereço gerado. Garanta que `CLIENT_ORIGIN` no Render tenha a URL real da Vercel, **sem barra final**. Se alterar variáveis de ambiente, faça novo deploy/redeploy.

## Organização

```text
telefone_sem_fio/
├── client/           # React + Vite + Socket.IO Client
│   └── src/
│       ├── main.jsx  # Telas, salas, jogo, desenho e revelação
│       └── style.css
└── server/           # Express + Socket.IO
    └── src/index.js  # Sala, rodadas, atribuição de histórias e tempo
```

## Regras do jogo

Cada pessoa escreve uma frase na rodada 1. Na rodada 2, o participante seguinte desenha essa frase; na rodada 3, outra pessoa descreve o desenho, e assim sucessivamente. Ninguém vê a cadeia completa durante o jogo. Ao final de **N** rodadas (N = número de jogadores), o grupo descobre como cada história mudou.

## Limitações desta versão

- Sem contas, classificação, moderação, chat ou banco de dados.
- Salas privadas por código, **não são protegidas por senha**.
- Dados de desenhos são enviados ao servidor e ficam na memória somente durante a vida da sala.
- Não há modo espectador. Jogadores novos não podem entrar depois de iniciada a partida.
- Para evitar abandono, respostas ausentes são preenchidas automaticamente quando o tempo acaba ou alguém desconecta.
- O professor deve verificar as regras de uso da rede e a autorização da instituição antes de utilizar o jogo em ambiente escolar.

