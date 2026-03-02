// ❌ CODE À TRANSFORMER

let accountHolder = "";
let balance = 0;
let interestRate = 0;
let minimumBalance = 100;
const penaltyFee = 15;

function openAccount(name: string, initialDeposit: number, rate: number) {
    accountHolder = name;
    balance = initialDeposit;
    interestRate = rate;
    console.log(`Compte ouvert pour ${name}`);
}
 
function deposit(amount: number) {
    if (amount <= 0) {
        console.log("Montant invalide");
        return false;
    }
    balance += amount;
    console.log(`Dépôt de ${amount}€ effectué`);
    return true;
}

function withdraw(amount: number) {
    if (amount <= 0) {
        console.log("Montant invalide");
        return false;
    }
    
    const newBalance = balance - amount;
    
    if (newBalance < 0) {
        console.log("Solde insuffisant");
        return false;
    }
    
    balance = newBalance;
    
    if (balance < minimumBalance) {
        balance -= penaltyFee;
        console.log(`⚠️ Pénalité de ${penaltyFee}€ appliquée`);
    }
    
    console.log(`Retrait de ${amount}€ effectué`);
    return true;
}

function calculateYearlyInterest(): number {
    return balance * (interestRate / 100);
}

function applyYearlyInterest() {
    const interest = calculateYearlyInterest();
    balance += interest;
    console.log(`Intérêts de ${interest.toFixed(2)}€ crédités`);
}

function getAccountInfo() {
    console.log(`=== Compte de ${accountHolder} ===`);
    console.log(`Solde: ${balance.toFixed(2)}€`);
    console.log(`Taux d'intérêt: ${interestRate}%`);
    console.log(`Intérêts annuels estimés: ${calculateYearlyInterest().toFixed(2)}€`);
}

function isBelowMinimum(): boolean {
    return balance < minimumBalance;
}

// Utilisation
openAccount("Marie Dupont", 500, 2.5);
deposit(200);
withdraw(50);
applyYearlyInterest();
getAccountInfo();