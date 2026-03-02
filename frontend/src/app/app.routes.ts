import { Routes } from '@angular/router';
import { TradingComponent } from './pages/trading/trading';

export const routes: Routes = [
    { path: 'trading', component: TradingComponent },
    { path: '', redirectTo: 'trading', pathMatch: 'full' }
];
