const express = require('express');
const webPush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const vapidKeys = {
    publicKey: 'BHrsn8mzggbB7MhwQQo2V_izX9qxEtSJMzTNTAMfBDMiOK2xrL3k_KGpJP3S_1Wb_SvE_eEAPsIATp_D1PCGMus',
    privateKey: 'i2-A4Fnk7YN5qd-4eljzC8fNMXiVJEvo_YeSk9z8HKI'
};

webPush.setVapidDetails(
    'mailto:tu-email@ejemplo.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'notificaciones',
    port: 3306
});

db.connect(err => {
    if (err) {
        console.error('Error conectando a la base de datos:', err.stack);
        return;
    }
    console.log('Conectado a la base de datos MySQL.');
});

db.query(`CREATE TABLE IF NOT EXISTS subscribers (
    userId VARCHAR(36) PRIMARY KEY,
    subscription TEXT
)`, (err) => {
    if (err) {
        console.error(err.message);
    }
});

db.query(`CREATE TABLE IF NOT EXISTS meetings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId VARCHAR(36),
    title VARCHAR(255),
    meetingTime DATETIME,
    endTime DATETIME,
    FOREIGN KEY (userId) REFERENCES subscribers(userId)
)`, (err) => {
    if (err) {
        console.error(err.message);
    }
});

app.post('/subscribe', (req, res) => {
    const subscription = JSON.stringify(req.body);
    const userId = uuidv4();

    db.query(`SELECT * FROM subscribers WHERE subscription = ?`, [subscription], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Error al verificar la suscripción' });
        }
        if (rows.length > 0) {
            return res.status(200).json({ userId: rows[0].userId });
        }

        db.query(`INSERT INTO subscribers (userId, subscription) VALUES (?, ?)`, [userId, subscription], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error al guardar la suscripción' });
            }

            const payload = JSON.stringify({ 
                title: 'Notificación de bienvenida', 
                body: '¡Bienvenido a nuestro servicio de notificaciones!',
                url: 'https://fast.com/es/'
            });

            webPush.sendNotification(JSON.parse(subscription), payload)
                .then(() => res.status(200).json({ userId }))
                .catch(err => {
                    console.error('Error al enviar notificación:', err);
                    res.sendStatus(500);
                });
        });
    });
});

app.get('/subscribers', (req, res) => {
    db.query(`SELECT * FROM subscribers`, (err, rows) => {
        if (err) {
            return res.sendStatus(500);
        }
        res.json(rows);
    });
});

app.get('/meetings', (req, res) => {
    const userId = req.query.userId;
    db.query(`SELECT * FROM meetings WHERE userId = ?`, [userId], (err, rows) => {
        if (err) {
            return res.sendStatus(500);
        }
        res.json(rows);
    });
});

app.post('/meetings', (req, res) => {
    const { title, meetingTime, endTime, userId } = req.body;

    if (!userId || !meetingTime || !endTime || !title) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    db.query(`SELECT * FROM meetings WHERE userId = ? AND meetingTime = ?`, [userId, meetingTime], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Error del servidor al verificar la reunión.' });
        }
        if (rows.length > 0) {
            return res.status(409).json({ message: 'La reunión ya está agendada.' });
        }

        const query = `INSERT INTO meetings (title, userId, meetingTime, endTime) VALUES (?, ?, ?, ?)`;
        db.query(query, [title, userId, meetingTime, endTime], (err, result) => {
            if (err) {
                return res.status(500).json({ message: 'Error del servidor al agendar la reunión.' });
            }

            const timeUntilMeeting = new Date(meetingTime).getTime() - Date.now();
            if (timeUntilMeeting > 60000) {
                setTimeout(() => {
                    sendNotificationToUser(userId, `Tu reunión "${title}" está por comenzar`, title, meetingTime, endTime);
                }, timeUntilMeeting - 60000);
            }

            return res.status(200).json({ message: 'Reunión agendada con éxito.' });
        });
    });
});

const sendNotificationToUser = (userId, message, title, meetingTime, endTime) => {
    db.query(`SELECT subscription FROM subscribers WHERE userId = ?`, [userId], (err, rows) => {
        if (err) {
            console.error('Error al obtener la suscripción:', err.message);
            return;
        }
        if (rows.length > 0) {
            const subscription = JSON.parse(rows[0].subscription);
            const payload = JSON.stringify({
                title: title,
                body: `${message} desde ${new Date(meetingTime).toLocaleString()} hasta ${new Date(endTime).toLocaleString()}`,
                url: 'https://tu-url.com'
            });
            webPush.sendNotification(subscription, payload)
                .then(() => console.log('Notificación enviada con éxito'))
                .catch(err => console.error('Error al enviar notificación:', err));
        } else {
            console.log('No se encontró suscripción para el usuario:', userId);
        }
    });
};

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
