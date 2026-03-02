import * as crypto from 'crypto';      // Hachage sécurisé (SHA-256) pour ne jamais stocker les numéros de carte en clair
import * as nodemailer from 'nodemailer'; // Envoi d'e-mails SMTP (confirmations et annulations)

/**
 * Système de réservation en mémoire.
 * Les réservations sont stockées dans un tableau ; en production on utiliserait une base de données.
 */
class BookingSystem {
    /** Liste de toutes les réservations (en production : remplacé par un accès DB). */
    private bookings: any[] = [];
    /** Prochain ID attribué (incrémenté à chaque createBooking). */
    private nextId: number = 1;

    /**
     * Crée une nouvelle réservation après validation, calcul du prix et traitement du paiement.
     * Envoie un e-mail de confirmation et génère un contenu type "reçu" (simulation PDF).
     *
     * @param guestName - Nom du client (2–100 caractères, espaces en trop retirés)
     * @param guestEmail - Adresse e-mail valide (format xxx@yyy.zzz)
     * @param roomNumber - Numéro de chambre 1–500 (détermine la catégorie et le tarif)
     * @param checkInDate - Date d'entrée (≥ aujourd'hui)
     * @param checkOutDate - Date de sortie (> checkInDate, séjour max 365 jours)
     * @param paymentType - 'credit_card' | 'paypal' | 'bank_transfer' | 'cash'
     * @param paymentDetails - Selon le type : cardNumber/cvv/expiryDate, email, accountNumber, ou vide
     * @returns L'objet réservation créé (id, guestName, roomNumber, totalPrice, etc.)
     * @throws Error si validation échoue, chambre indisponible ou type de paiement invalide
     */
    createBooking(
        guestName: string,
        guestEmail: string,
        roomNumber: number,
        checkInDate: Date,
        checkOutDate: Date,
        paymentType: string,
        paymentDetails: any
    ) {
        // ─────────── VALIDATION ───────────

        // Si le nom est vide ou fait moins de 2 caractères (après suppression des espaces)
        if (!guestName || guestName.trim().length < 2) {
            throw new Error('Guest name must be at least 2 characters');
        }
        // Si le nom dépasse 100 caractères
        if (guestName.length > 100) {
            throw new Error('Guest name too long');
        }

        // Regex : au moins un caractère avant @, un domaine avec un point
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        // Si l’email ne respecte pas le format
        if (!emailRegex.test(guestEmail)) {
            throw new Error('Invalid email format');
        }

        // Date du jour
        const today = new Date();
        // On met l’heure à 00:00:00 pour comparer uniquement les dates
        today.setHours(0, 0, 0, 0);

        // Si la date d’entrée est avant aujourd’hui
        if (checkInDate < today) {
            throw new Error('Check-in date cannot be in the past');
        }
        // Si la date de sortie n’est pas après la date d’entrée
        if (checkOutDate <= checkInDate) {
            throw new Error('Check-out date must be after check-in date');
        }

        // Durée max du séjour en jours
        const maxStayDays = 365;
        // Durée en jours : (sortie - entrée) en ms, divisé par ms par jour
        const stayDuration = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24);
        // Si le séjour dépasse la limite
        if (stayDuration > maxStayDays) {
            throw new Error(`Maximum stay is ${maxStayDays} days`);
        }

        // Numéro de chambre hors plage 1–500
        if (roomNumber < 1 || roomNumber > 500) {
            throw new Error('Invalid room number (must be between 1 and 500)');
        }

        // true si aucune résa active ne chevauche : même chambre, pas annulée, et dates qui se chevauchent
        const isRoomAvailable = !this.bookings.some(booking => {
            // Même chambre
            return booking.roomNumber === roomNumber &&
                // Résa non annulée
                booking.status !== 'cancelled' &&
                // Chevauchement : entrée dans la résa existante OU sortie dans la résa OU nouvelle résa englobe l’ancienne
                ((checkInDate >= booking.checkInDate && checkInDate < booking.checkOutDate) ||
                    (checkOutDate > booking.checkInDate && checkOutDate <= booking.checkOutDate) ||
                    (checkInDate <= booking.checkInDate && checkOutDate >= booking.checkOutDate));
        });
        // Si la chambre n’est pas dispo sur ces dates
        if (!isRoomAvailable) {
            throw new Error('Room is not available for the selected dates');
        }

        // ─────────── CALCUL DU PRIX ───────────

        // Tarif de base par nuit (en unité monétaire)
        const baseRatePerNight = 100;
        // Nombre de nuits (arrondi au supérieur, ex. 3.2 → 4)
        const nights = Math.ceil(stayDuration);
        // Prix total initial = nuits × tarif de base
        let totalPrice = nights * baseRatePerNight;

        // Majoration selon la catégorie de chambre (définie par le numéro)
        if (roomNumber >= 1 && roomNumber <= 100) {
            totalPrice *= 1.0;   // Chambres 1–100 : standard, pas de majoration
        } else if (roomNumber >= 101 && roomNumber <= 200) {
            totalPrice *= 1.3;   // Chambres 101–200 : deluxe, +30 %
        } else if (roomNumber >= 201 && roomNumber <= 300) {
            totalPrice *= 1.8;   // Chambres 201–300 : suite, +80 %
        } else {
            totalPrice *= 2.5;   // Chambres 301–500 : premium, +150 %
        }

        // Réduction selon la durée du séjour
        if (nights >= 7 && nights < 14) {
            totalPrice *= 0.95;  // 7–13 nuits : -5 %
        } else if (nights >= 14 && nights < 30) {
            totalPrice *= 0.90;  // 14–29 nuits : -10 %
        } else if (nights >= 30) {
            totalPrice *= 0.80;  // 30 nuits ou plus : -20 %
        }

        // Mois de la date d’entrée (0 = janvier, 6 = juillet, 7 = août)
        const checkInMonth = checkInDate.getMonth();
        // Haute saison : juillet ou août, +25 %
        if (checkInMonth === 6 || checkInMonth === 7) {
            totalPrice *= 1.25;
        }

        // Arrondir à 2 décimales (ex. 123.456 → 123.46)
        totalPrice = Math.round(totalPrice * 100) / 100;

        // ─────────── TRAITEMENT DU PAIEMENT ───────────

        // Référence de confirmation (sera remplie selon le type : CC-, PP-, BT-, CASH-)
        let paymentConfirmation = '';
        // Statut : 'pending' (en attente) ou 'confirmed' (confirmé)
        let paymentStatus: 'pending' | 'confirmed' = 'pending';

        if (paymentType === 'credit_card') {
            // Récupération des infos carte depuis paymentDetails
            const cardNumber = paymentDetails.cardNumber;
            const cvv = paymentDetails.cvv;
            const expiryDate = paymentDetails.expiryDate;

            // Carte invalide si absente ou pas 16 chiffres
            if (!cardNumber || cardNumber.length !== 16) {
                throw new Error('Invalid card number');
            }
            // CVV invalide si absent ou pas 3 chiffres
            if (!cvv || cvv.length !== 3) {
                throw new Error('Invalid CVV');
            }

            // Hash SHA-256 du numéro de carte (pour logs sans stocker la carte en clair)
            const hashedCard = crypto.createHash('sha256')
                .update(cardNumber)
                .digest('hex');

            console.log(`Processing credit card payment: ${hashedCard}`);
            console.log(`Amount: $${totalPrice}`);

            // Référence unique : CC- + timestamp + 9 caractères aléatoires (base 36)
            paymentConfirmation = `CC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            paymentStatus = 'confirmed';

        } else if (paymentType === 'paypal') {
            // Email du compte PayPal
            const paypalEmail = paymentDetails.email;

            // Email absent ou format invalide
            if (!paypalEmail || !emailRegex.test(paypalEmail)) {
                throw new Error('Invalid PayPal email');
            }

            console.log(`Processing PayPal payment: ${paypalEmail}`);
            console.log(`Amount: $${totalPrice}`);

            // Référence type PP- + timestamp + aléatoire
            paymentConfirmation = `PP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            paymentStatus = 'confirmed';

        } else if (paymentType === 'bank_transfer') {
            // Numéro de compte bancaire
            const bankAccount = paymentDetails.accountNumber;

            // Compte requis
            if (!bankAccount) {
                throw new Error('Bank account number required');
            }

            console.log(`Bank transfer initiated: ${bankAccount}`);
            console.log(`Amount: $${totalPrice}`);

            // Référence virement ; statut reste pending jusqu’à réception
            paymentConfirmation = `BT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            paymentStatus = 'pending';

        } else if (paymentType === 'cash') {
            console.log('Cash payment on arrival');
            // Référence espèces ; paiement à l’arrivée
            paymentConfirmation = `CASH-${Date.now()}`;
            paymentStatus = 'pending';

        } else {
            throw new Error('Invalid payment type');
        }

        // ─────────── CRÉATION DE LA RÉSERVATION ───────────

        const booking = {
            id: this.nextId++,                         // ID unique, puis on incrémente le compteur
            guestName: guestName.trim(),               // Nom sans espaces en début/fin
            guestEmail: guestEmail.toLowerCase(),     // Email en minuscules
            roomNumber: roomNumber,
            checkInDate: checkInDate,
            checkOutDate: checkOutDate,
            nights: nights,
            totalPrice: totalPrice,
            paymentType: paymentType,
            paymentConfirmation: paymentConfirmation,
            paymentStatus: paymentStatus,
            status: 'confirmed',                       // Résa créée = confirmée
            createdAt: new Date(),                      // Date/heure de création
            updatedAt: new Date()                      // Dernière modification
        };

        // Ajout de la résa au tableau en mémoire
        this.bookings.push(booking);
        console.log(`Booking saved with ID: ${booking.id}`);

        // ─────────── ENVOI D'EMAIL DE CONFIRMATION ───────────

        // Configuration du transport SMTP (serveur d’envoi d’e-mails)
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',   // Serveur Gmail
            port: 587,                // Port TLS
            secure: false,            // true pour port 465
            auth: {
                user: 'hotel@example.com',
                pass: 'password123'
            }
        });

        // Sujet de l’e-mail avec numéro de résa
        const emailSubject = `Booking Confirmation #${booking.id}`;
        // Corps de l’e-mail (template avec les infos de la résa)
        const emailBody = `
      Dear ${guestName},
      
      Thank you for your reservation!
      
      Booking Details:
      - Confirmation Number: ${booking.id}
      - Room Number: ${roomNumber}
      - Check-in: ${checkInDate.toLocaleDateString()}
      - Check-out: ${checkOutDate.toLocaleDateString()}
      - Number of nights: ${nights}
      - Total Price: $${totalPrice}
      - Payment Status: ${paymentStatus}
      
      We look forward to welcoming you!
      
      Best regards,
      Hotel Management
    `;

        // Envoi de l’e-mail (asynchrone, callback appelé à la fin)
        transporter.sendMail({
            from: 'hotel@example.com',
            to: guestEmail,
            subject: emailSubject,
            text: emailBody
        }, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
            } else {
                console.log('Confirmation email sent:', info.messageId);
            }
        });

        // ─────────── SIMULATION RECU / PDF ───────────
        // Chaîne formatée type “reçu” ; padEnd(n) = compléter avec espaces pour aligner les colonnes
        const pdfContent = `
╔════════════════════════════════════════════════╗
║          BOOKING CONFIRMATION                   ║
╠════════════════════════════════════════════════╣
║                                                ║
║  Confirmation Number: ${String(booking.id).padEnd(22)}║
║  Guest Name: ${guestName.padEnd(31)}║
║  Room Number: ${String(roomNumber).padEnd(30)}║
║  Check-in: ${checkInDate.toLocaleDateString().padEnd(33)}║
║  Check-out: ${checkOutDate.toLocaleDateString().padEnd(32)}║
║  Nights: ${String(nights).padEnd(37)}║
║  Total Price: $${String(totalPrice).padEnd(28)}║
║  Payment: ${paymentType.padEnd(34)}║
║  Status: ${paymentStatus.padEnd(35)}║
║                                                ║
╚════════════════════════════════════════════════╝
    `;

        console.log('Generated PDF:');
        console.log(pdfContent);

        // Retourner l’objet réservation créé
        return booking;
    }

    /**
     * Annule une réservation si elle existe, n'est pas déjà annulée, et au moins 24 h avant le check-in.
     * Calcule le remboursement (100 % si ≥14 j, 75 % si ≥7 j, 50 % sinon), met à jour le statut,
     * log le remboursement pour carte/PayPal et envoie un e-mail d'annulation.
     *
     * @param bookingId - ID de la réservation à annuler
     * @param reason - Motif d'annulation (stocké et envoyé au client)
     * @returns { bookingId, status: 'cancelled', refundAmount, refundPercentage }
     * @throws Error si réservation introuvable, déjà annulée ou < 24 h avant check-in
     */
    cancelBooking(bookingId: number, reason: string) {
        // Recherche de la résa par ID dans le tableau
        const booking = this.bookings.find(b => b.id === bookingId);

        // Résa inexistante
        if (!booking) {
            throw new Error('Booking not found');
        }
        // Déjà annulée
        if (booking.status === 'cancelled') {
            throw new Error('Booking is already cancelled');
        }

        // Date/heure actuelle
        const now = new Date();
        // Nombre d’heures entre maintenant et la date d’entrée
        const hoursBefore = (booking.checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Annulation interdite si moins de 24 h avant l’entrée
        if (hoursBefore < 24) {
            throw new Error('Cancellation must be done at least 24 hours before check-in');
        }

        // Pourcentage remboursé (par défaut 100 %)
        let refundPercentage = 100;
        // Jours avant le check-in
        const daysBefore = hoursBefore / 24;

        // Moins de 7 jours : 50 % remboursé
        if (daysBefore < 7) {
            refundPercentage = 50;
        } else if (daysBefore < 14) {
            refundPercentage = 75;  // 7–13 jours : 75 % remboursé
        }
        // 14 jours ou plus : 100 % (déjà défini)

        // Montant à rembourser = total × pourcentage / 100
        const refundAmount = (booking.totalPrice * refundPercentage) / 100;

        // Log du remboursement pour carte ou PayPal (si paiement déjà confirmé)
        if (booking.paymentType === 'credit_card' && booking.paymentStatus === 'confirmed') {
            console.log(`Processing credit card refund: $${refundAmount}`);
            console.log(`Refund confirmation: REF-${booking.paymentConfirmation}`);
        } else if (booking.paymentType === 'paypal' && booking.paymentStatus === 'confirmed') {
            console.log(`Processing PayPal refund: $${refundAmount}`);
            console.log(`Refund confirmation: REF-${booking.paymentConfirmation}`);
        }

        // Mise à jour de la résa : statut annulé + motif + date + montant remboursé
        booking.status = 'cancelled';
        booking.cancellationReason = reason;
        booking.cancellationDate = new Date();
        booking.refundAmount = refundAmount;
        booking.updatedAt = new Date();

        // Même config SMTP que pour la confirmation
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: 'hotel@example.com',
                pass: 'password123'
            }
        });

        // Corps de l’e-mail d’annulation (montant, %, motif)
        const emailBody = `
      Dear ${booking.guestName},
      
      Your booking #${booking.id} has been cancelled.
      
      Refund amount: $${refundAmount} (${refundPercentage}%)
      Reason: ${reason}
      
      The refund will be processed within 5-10 business days.
      
      Best regards,
      Hotel Management
    `;

        // Envoi de l’e-mail d’annulation au client
        transporter.sendMail({
            from: 'hotel@example.com',
            to: booking.guestEmail,
            subject: `Booking Cancellation #${booking.id}`,
            text: emailBody
        });

        // Retourner le résumé : id, statut, montant et % remboursés
        return {
            bookingId: booking.id,
            status: 'cancelled',
            refundAmount: refundAmount,
            refundPercentage: refundPercentage
        };
    }

    /**
     * Récupère une réservation par son ID.
     * @param bookingId - ID de la réservation
     * @returns L'objet réservation ou undefined si non trouvée
     */
    getBooking(bookingId: number) {
        // Premier élément dont l’id correspond, ou undefined
        return this.bookings.find(b => b.id === bookingId);
    }

    /**
     * Retourne la liste complète des réservations (pour admin / debug).
     */
    getAllBookings() {
        // Retour du tableau de toutes les résas
        return this.bookings;
    }
}

// Export de la classe pour l’utiliser dans d’autres fichiers (import BookingSystem from '...')
export default BookingSystem;