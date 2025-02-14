import { Component, Renderer2, OnInit } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  private originalName = 'Đuđev';
  private animationFrameId: number | null = null;

  constructor(private renderer: Renderer2) {}

  ngOnInit(): void {
    // Random delay between 0.5s and 1.5s
    const delay = Math.random() * 500 + 100;
    setTimeout(() => this.initializeEffects(), delay);
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private initializeEffects(): void {
    // Hide loading screen
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';

    // Custom cursor
    const customCursor = document.querySelector('.custom-cursor') as HTMLElement;
    document.addEventListener('mousemove', (e: MouseEvent) => {
      customCursor.style.transform = `translate(${e.pageX}px, ${e.pageY}px)`;
    });

    // Name randomization
    setInterval(() => this.randomSymbols(), 1000);

    // Canvas setup
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!canvas || !ctx) return;

    // Initial setup
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      createStars();
    };

    // Star field setup
    let stars: any[] = [];
    const mouse = { x: 0, y: 0 };

    const createStars = () => {
      stars = [];
      const starCount = window.innerWidth > 500 
        ? Math.floor(Math.random() * 50 + 100)
        : Math.floor(Math.random() * 40 + 20);

      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1 + 1,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2
        });
      }
    };

    // Animation loop
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw stars
      ctx.fillStyle = '#482268';
      stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw connections
      ctx.beginPath();
      ctx.strokeStyle = '#48226893';
      ctx.lineWidth = 0.3;
      
      stars.forEach((a, i) => {
        stars.slice(i).forEach(b => {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        });
      });
      ctx.stroke();
    };

    const update = () => {
      stars.forEach(star => {
        star.x += star.vx;
        star.y += star.vy;
        
        if (star.x < 0 || star.x > canvas.width) star.vx *= -1;
        if (star.y < 0 || star.y > canvas.height) star.vy *= -1;
      });
    };

    const animate = () => {
      update();
      draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    // Event listeners
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });

    // Initial setup
    resizeCanvas();
    animate();
  }

  private randomSymbols(): void {
    const symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?";
    const suNameEl = document.getElementById('su_name');
    if (!suNameEl) return;

    const nameArray = this.originalName.split('');
    const indices = new Set<number>();
    while (indices.size < 2) {
      indices.add(Math.floor(Math.random() * nameArray.length));
    }

    indices.forEach(i => {
      nameArray[i] = symbols[Math.floor(Math.random() * symbols.length)];
    });

    suNameEl.textContent = nameArray.join('');
  }
}