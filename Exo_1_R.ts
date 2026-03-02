export class BankAccount {
    // 📦 PROPRIÉTÉS
    private _accountHolder: string = "";
    private _balance: number = 0;
    private _interestRate: number = 0;
    private _minBalance: number = 100;
    private readonly _penaltyFee: number = 15;
    
    // 🔨 CONSTRUCTOR (équivalent de openAccount)
    constructor(name: string, initialDeposit: number, rate: number) {
        this._accountHolder = name;
        this._balance = initialDeposit;
        this._interestRate = rate;
        console.log(`Compte ouvert pour ${name}`);
    }

    // ⚙️ MÉTHODES PUBLIQUES
    deposit(amount: number): boolean {
        if (amount <= 0) {
            console.log("Montant invalide");
            return false;
        }
        this._balance += amount;
        console.log(`Dépôt de ${amount}€ effectué`);
        return true;
    }
    withdraw(amount: number): boolean {
        if (amount <= 0) {
            console.log("Montant invalide");
            return false;
        }
        const newBalance = this._balance - amount;
        if (newBalance < 0) {
            console.log("Solde insuffisant");
            return false;
        }
        this._balance = newBalance;
        if (this._balance < this._minBalance) {
            this._balance -= this._penaltyFee;
            console.log(`⚠️ Pénalité de ${this._penaltyFee}€ appliquée`);
        }
        console.log(`Retrait de ${amount}€ effectué`);
        return true;
    }
    calculateYearlyInterest(): number {
        return this._balance * (this._interestRate / 100);
    }
    applyYearlyInterest(): void {
        const interest = this.calculateYearlyInterest();
        this._balance += interest;
        console.log(`Intérêts de ${interest.toFixed(2)}€ crédités`);
    }
    getAccountInfo(): void {
        console.log(`=== Compte de ${this._accountHolder} ===`);
        console.log(`Solde: ${this._balance.toFixed(2)}€`);
        console.log(`Taux d'intérêt: ${this._interestRate}%`);
        console.log(`Intérêts annuels estimés: ${this.calculateYearlyInterest().toFixed(2)}€`);
    }
    isBelowMinimum(): boolean {
        return this._balance < this._minBalance;
    }
}

// Utilisation (même scénario que Exo_1.ts)
const account = new BankAccount("Marie Dupont", 500, 2.5);
account.deposit(200);
account.withdraw(50);
account.applyYearlyInterest();
account.getAccountInfo();

// Test pénalité (solde sous le minimum après retrait)
console.log("\n=== Test pénalité ===");
const account2 = new BankAccount("Jean Martin", 150, 2);
account2.withdraw(80);  // 150 - 80 = 70 < 100 → pénalité 15€ → solde 55€
account2.getAccountInfo();