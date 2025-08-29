//TODO

import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root',
})

export class AuthGuard implements CanActivate {

  constructor(private router: Router) { }


  canActivate(): boolean {
    const token = localStorage.getItem('token');
    console.log("Authguard canActivate called, token:", token)
    if (!token) {
      console.log("No token found, redirecting to /login");
      this.router.navigate(['/login'])

      return false;
    }

    try {
      const decoded = jwtDecode<JwtPayload>(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        console.log('Token expirado, redirigiendo a login');
        localStorage.removeItem('token');
        this.router.navigate(['/login']);
        return false;
      }
      return true;
    } catch (err) {
      console.log('Token invalido, redirigiendo a login');
      localStorage.removeItem('token');
      this.router.navigate(['/login'])
      return false;
    }



  }
}
interface JwtPayload {
  exp: number;
  sub: string;
}
