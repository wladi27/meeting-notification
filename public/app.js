const applicationServerKey = urlB64ToUint8Array('BHrsn8mzggbB7MhwQQo2V_izX9qxEtSJMzTNTAMfBDMiOK2xrL3k_KGpJP3S_1Wb_SvE_eEAPsIATp_D1PCGMus');

document.getElementById('subscribe').addEventListener('click', async () => {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/public/service-worker.js');
            console.log('Service Worker registrado con éxito:', registration);

            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
                console.log('Usuario suscrito:', subscription);

                const response = await fetch('https://meeting-notification-production.up.railway.app/subscribe', {
                    method: 'POST',
                    body: JSON.stringify(subscription),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('Error al suscribirse en el servidor');
                }

                const data = await response.json();
                localStorage.setItem('userId', data.userId);
                fetchSubscribers();
            } else {
                console.log('Ya está suscrito:', subscription);
            }
        } catch (error) {
            console.error('Error al registrar el Service Worker o suscribirse:', error);
        }
    }
});

document.getElementById('meeting-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.getElementById('meeting-title').value;
    const meetingTime = document.getElementById('meeting-time').value;
    const endTime = document.getElementById('meeting-end-time').value;
    const userId = localStorage.getItem('userId');

    if (!userId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Debes suscribirte primero para agendar una reunión.'
        });
        return;
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const response = await fetch('https://meeting-notification-production.up.railway.app/meetings', {
            method: 'POST',
            body: JSON.stringify({ title, meetingTime, endTime, userId }),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        Swal.fire({
            icon: response.ok ? 'success' : 'error',
            title: response.ok ? 'Éxito' : 'Error',
            text: data.message
        });

        if (response.ok) {
            document.getElementById('meeting-form').reset();
            document.getElementById('meeting-modal').classList.add('hidden');
            updateMeetingList(userId);
        }
    } catch (error) {
        console.error('Error al agendar la reunión:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Hubo un problema al conectar con el servidor.'
        });
    } finally {
        submitButton.disabled = false;
    }
});

async function updateMeetingList(userId) {
    try {
        const response = await fetch(`https://meeting-notification-production.up.railway.app/p.railway.app/meetings?userId=${userId}`);
        const meetings = await response.json();
        const meetingCards = document.getElementById('meeting-cards');
        meetingCards.innerHTML = '';

        meetings.forEach(meeting => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg p-4 shadow';
            const meetingTime = new Date(meeting.meetingTime);
            const endTime = new Date(meeting.endTime);
            card.innerHTML = `
                <div>Reunión: ${meetingTime.toLocaleString()}</div>
                <div id="countdown-${meeting.id}"></div>
            `;
            meetingCards.appendChild(card);
            startCountdown(meeting.id, meetingTime, endTime);
        });

        // Iniciar verificación periódica del estado de las reuniones
        setInterval(() => checkMeetingStatus(meetings), 60000); // Cada 60 segundos
    } catch (error) {
        console.error('Error al obtener la lista de reuniones:', error);
    }
}

function startCountdown(meetingId, meetingTime, endTime) {
    const countdownElement = document.getElementById(`countdown-${meetingId}`);
    let interval;

    const updateCountdown = () => {
        const now = new Date();
        const timeDifference = meetingTime - now;
        const endTimeDifference = endTime - now;

        if (endTimeDifference <= 0) {
            countdownElement.textContent = 'La reunión ha finalizado';
            clearInterval(interval);
            return;
        }

        if (timeDifference <= 0) {
            countdownElement.textContent = 'La reunión ha comenzado';
            clearInterval(interval);
            return;
        }

        const hours = Math.floor(timeDifference / (1000 * 60 * 60));
        const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);
        countdownElement.textContent = `Comienza en: ${hours}h ${minutes}m ${seconds}s`;
    };

    updateCountdown();
    interval = setInterval(updateCountdown, 1000);
}

function checkMeetingStatus(meetings) {
    const now = new Date();
    meetings.forEach(meeting => {
        const endTime = new Date(meeting.endTime);
        const countdownElement = document.getElementById(`countdown-${meeting.id}`);

        if (endTime <= now) {
            countdownElement.textContent = 'La reunión ha finalizado';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const userId = localStorage.getItem('userId');
    if (userId) {
        updateMeetingList(userId);
    }
});

function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
}

const fetchSubscribers = async () => {
    try {
        const response = await fetch('https://meeting-notification-production.up.railway.app/subscribers');
        const subscribers = await response.json();
        const subscriberList = document.getElementById('subscriber-list');
        subscriberList.innerHTML = '';

        subscribers.forEach(subscriber => {
            const listItem = document.createElement('li');
            listItem.textContent = subscriber.userId;
            subscriberList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Error al obtener la lista de suscriptores:', error);
    }
};

document.getElementById('add-meeting').addEventListener('click', () => {
    document.getElementById('meeting-modal').classList.remove('hidden');
});

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('meeting-modal').classList.add('hidden');
});
