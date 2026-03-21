import { Component } from '@angular/core';

@Component({
  selector: 'app-clouds-bg',
  standalone: true,
  template: `
    <div class="clouds" aria-hidden="true">
      <div class="cloud cloud--1"></div>
      <div class="cloud cloud--2"></div>
      <div class="cloud cloud--3"></div>
      <div class="cloud cloud--4"></div>
      <div class="cloud cloud--5"></div>
      <div class="cloud cloud--6"></div>
      <div class="cloud cloud--7"></div>
      <div class="cloud cloud--8"></div>
    </div>
    <img class="home-background" src="assets/images/home_background.png" alt="" aria-hidden="true" />
  `,
  styles: [`
    .clouds {
      position: fixed;
      inset: 0;
      pointer-events: none;
      overflow: visible;
      z-index: 0;
    }

    .cloud {
      position: absolute;
      background: #fff;
      border-radius: 50px;
      filter: blur(4px);
      opacity: 0.95;
      transform-origin: center;
    }

    .cloud::before,
    .cloud::after {
      content: "";
      position: absolute;
      background: #fff;
      border-radius: 50%;
    }

    .cloud::before { width: 70px; height: 70px; top: -30px; left: 8px; }
    .cloud::after  { width: 100px; height: 100px; top: -22px; right: 8px; }

    .cloud--1 { width: 280px; height: 90px; top: 6%; left: 8%; animation: cloud-float 12s ease-in-out infinite; animation-delay: 0s; }
    .cloud--2 { width: 220px; height: 70px; top: 26%; left: 32%; animation: cloud-float 10s ease-in-out infinite; animation-delay: 2s; }
    .cloud--3 { width: 340px; height: 100px; top: 50%; left: 60%; animation: cloud-float 14s ease-in-out infinite; animation-delay: 4s; }
    .cloud--4 { width: 180px; height: 56px; top: 74%; left: 80%; animation: cloud-float 9s ease-in-out infinite; animation-delay: 1s; }
    .cloud--5 { width: 240px; height: 80px; top: 12%; left: 48%; animation: cloud-float 11s ease-in-out infinite; animation-delay: 5s; opacity: 0.9; transform: scale(0.95); }
    .cloud--6 { width: 140px; height: 44px; top: 36%; left: 12%; animation: cloud-float 13s ease-in-out infinite; animation-delay: 7s; opacity: 0.85; transform: scale(0.9); }
    .cloud--7 { width: 200px; height: 66px; top: 62%; left: 40%; animation: cloud-float 15s ease-in-out infinite; animation-delay: 3s; opacity: 0.95; transform: scale(1.05); }
    .cloud--8 { width: 260px; height: 84px; top: 30%; left: 72%; animation: cloud-float 18s ease-in-out infinite; animation-delay: 10s; opacity: 0.92; transform: scale(1.02); }

    @keyframes cloud-float {
      0%   { transform: translate(0, 0) rotate(0deg); }
      25%  { transform: translate(8px, -6px) rotate(-0.5deg); }
      50%  { transform: translate(0, -4px) rotate(0deg); }
      75%  { transform: translate(-6px, 6px) rotate(0.5deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
    }

    @media (max-width: 767.98px) {
      .cloud--1, .cloud--3, .cloud--5, .cloud--7 { display: none; }
      .cloud--2, .cloud--4, .cloud--6, .cloud--8 { opacity: 0.85; transform: scale(0.9); }
    }

    .home-background {
      position: fixed;
      left: 0;
      bottom: 0;
      width: 50vw;
      opacity: 0.9;
      z-index: 1;
      pointer-events: none;
    }

    @media (max-width: 767.98px) {
      .home-background { width: 100vw; }
    }
  `],
})
export class CloudsBgComponent {}
