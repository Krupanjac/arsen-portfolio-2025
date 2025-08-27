import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import ImageKit from 'imagekit-javascript';

@Injectable({
  providedIn: 'root'
})
export class ImagekitService {
  private imagekit: any;

  constructor(private http: HttpClient) {
    // Initialize ImageKit with public key only
    this.imagekit = new ImageKit({
      publicKey: 'public_rsStEc0SEr7GBqnLskS9MganslE=', // Replace with actual public key
      urlEndpoint: 'https://ik.imagekit.io/s74ck0v3rfl0w' // Replace with actual URL endpoint
    });
  }

  uploadImage(file: File, fileName?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // First get authentication parameters from our server
      const headers = {
        'Content-Type': 'application/json'
      };

      this.http.post('/api/imagekit-auth', {}, { headers, withCredentials: true }).subscribe({
        next: (auth: any) => {
          const uploadOptions = {
            file: file,
            fileName: fileName || file.name,
            folder: '/portfolio-images',
            token: auth.token,
            signature: auth.signature,
            expire: auth.expire
          };

          this.imagekit.upload(uploadOptions, (error: any, result: any) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }

  getImageUrl(fileId: string, transformations?: any): string {
    return this.imagekit.url({
      src: fileId,
      transformation: transformations || []
    });
  }

  // Generate responsive image URLs for different device sizes
  getResponsiveImageUrls(fileId: string, options?: {
    mobileWidth?: number;
    tabletWidth?: number;
    desktopWidth?: number;
    quality?: number;
    format?: string;
  }): {
    src: string;
    srcset: string;
    sizes: string;
  } {
    const {
      mobileWidth = 400,
      tabletWidth = 800,
      desktopWidth = 1200,
      quality = 80,
      format = 'auto'
    } = options || {};

    // Base transformations
    const baseTransformations = [
      { q: quality },
      { f: format }
    ];

    // Generate URLs for different sizes
    const mobileUrl = this.imagekit.url({
      src: fileId,
      transformation: [
        ...baseTransformations,
        { w: mobileWidth }
      ]
    });

    const tabletUrl = this.imagekit.url({
      src: fileId,
      transformation: [
        ...baseTransformations,
        { w: tabletWidth }
      ]
    });

    const desktopUrl = this.imagekit.url({
      src: fileId,
      transformation: [
        ...baseTransformations,
        { w: desktopWidth }
      ]
    });

    return {
      src: desktopUrl, // Default/fallback
      srcset: `${mobileUrl} ${mobileWidth}w, ${tabletUrl} ${tabletWidth}w, ${desktopUrl} ${desktopWidth}w`,
      sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
    };
  }

  // Generate modal image URLs (higher quality, larger sizes)
  getModalImageUrls(fileId: string, options?: {
    mobileWidth?: number;
    tabletWidth?: number;
    desktopWidth?: number;
    quality?: number;
    format?: string;
  }): {
    src: string;
    srcset: string;
    sizes: string;
  } {
    const {
      mobileWidth = 600,
      tabletWidth = 1000,
      desktopWidth = 1600,
      quality = 90,
      format = 'auto'
    } = options || {};

    return this.getResponsiveImageUrls(fileId, {
      mobileWidth,
      tabletWidth,
      desktopWidth,
      quality,
      format
    });
  }

  // Generate preview image URLs (smaller, optimized for thumbnails)
  getPreviewImageUrls(fileId: string, options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  }): string {
    const {
      width = 400,
      height = 300,
      quality = 70,
      format = 'auto'
    } = options || {};

    return this.imagekit.url({
      src: fileId,
      transformation: [
        { w: width },
        { h: height },
        { c: 'at_max' }, // Crop to fit
        { q: quality },
        { f: format }
      ]
    });
  }
}
