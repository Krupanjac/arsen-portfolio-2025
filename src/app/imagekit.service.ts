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
}
