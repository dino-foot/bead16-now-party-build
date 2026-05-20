import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
let firebaseInitialized = false;
const FIREBASE_PROJECT_ID = "fiverr-retrive-project";
const FIREBASE_CLIENT_EMAIL = "firebase-adminsdk-tlq2q@fiverr-retrive-project.iam.gserviceaccount.com";
const FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDHaQ9f7G8n8mo5\nXyJTKWL5O3af5gZUzrt2bIYWFgIS1n5FBTTfi72RxJFHbn5PpY6Q1kb/aqlM/YVo\nCLFbzmc6Eow05bCtXOU1FUvnm4IBr1Gn8JM+L+35I6uHglxvFDgLLkNzQiYyiWLe\nlPk7dHONvtHrBa+SdsidaSU2SHvx8yVamleaLnTFwFJiSpL27nXvotPEfTfPxZ8N\nXR0lbxsqXCPp6HfRvmu3rJcdCRgRh6lYqeJx9CGbC+sJmMYawA0+Q3TmIzdSQMJk\ndtPzAquXrCNFk5mciIWRHinRpTC54djAd5YZKUQPDk9Kxj+ZoWFyTOtVoljmcbiH\ncQrhoiTBAgMBAAECggEAYTBZz3k3ReN3FUZCPwD1XZ63NsCQRmZJ5LKI+Zu5YAAN\no8shVXDQsIp6+jMmud/pZ7sf+F2+bSlFC4rtEl87XYjrr95g6WXUyrX5/ESFLRgL\nNsxgn1cR57MUZ2PIdFUI6Z4fPr43Srs+Jli6Tll39lZSDneDdmGRbnLwMZBLZISt\nGoYL/TlfOvUheoE/pq5TECAosUMpmmqJ4e/dfzopG/CP47dJk2kw6T0WjzeQxSnf\nkMBoLRuauHlVTUlaTmSAeeL1dwfPcU7kcCMOxw9/3Lm6Gg/RuVnl/9MbQM70lYF8\nGVs4x+dNqbQYROHZvBbDusRMyehZfzKZJUGc7IcCtwKBgQD7/zz36t6gyLCecriK\ntBhQVa20dLGcHwpz8kV70giqPLDbZQVLLBMutxH8uPVRWrxN0VO8C8WX/nX9lnhQ\nhDLT1qT78yfiRePYB4TgWkGQ9W1W0BWRQe5VaS8eiCQho1KrENrKFEANnoYDn6GT\nLcIJa0h32CojvNYygqdarjLstwKBgQDKk/mbdsP8G3MzhypvAm1NHz5PP3qKgZ2o\n+N0ep3buvdkpF2beayXU8t3nW3DCILkN4r5s2hFA3bVRl4IQpUWokJtCgG8k50Cf\nLWkGonIg1t1izrhWQUVg1c+P2aNRhJNr33kx3ECB+T6Ib5C89s946ELL8jfHVVe7\nmxexha9yRwKBgA2BCAthEr0bBBv5mdoU/JiRftWEy1/Kagz8lqyj/MLirbeUGkyE\n+CIwvU4Fu1+4tQ6WgR46o0QZ5sjIH3pxGygvAHhf92sww5z4Ci7bp1fVTx6v1/gI\nyHTbRiMkuIr07aEtLgxWOXiBXj0jeM0iTpuinCeP9fIkVHYwejdpzmDRAoGAPh+3\nEmgPnkbEw26WIsj5wAbu0trCt6scMG9xUC9HF9v8ts9IarktNursBkFSiRYD6jA4\n+aS+WcgkDMuLxZMJk7IVCwXcD9MjTC1e4fv7R/rclaqTeVA2+IVZS+IQZbVkiFZW\nEmZbGgDXnnuoRWrjIU8I/QZg+K5BY3UihPxcW40CgYEAyGIx1+szPC0MkrCOwVFN\nV0tLQgYSH+EF2I6TCpDL38fUB3+M6WH4LWDrqCulOWSFJ6WK2sXoLU+UYbaDFVVm\nYyCIyu/qDqfqECu02/VRStaYS5bwSHvGlvTaGrTfckWbGqEnDSnwlt3UNQGHGztT\nD4zHC7Pe1BJKCaMBUcN2tDk=\n-----END PRIVATE KEY-----\n";
export function initializeFirebase() {
    if (firebaseInitialized)
        return true;
    try {
        initializeApp({
            credential: cert({
                projectId: FIREBASE_PROJECT_ID,
                clientEmail: FIREBASE_CLIENT_EMAIL,
                privateKey: FIREBASE_PRIVATE_KEY,
            }),
        });
        firebaseInitialized = true;
        console.log("[FIREBASE] Admin SDK initialized successfully");
        return true;
    }
    catch (error) {
        console.error("[FIREBASE] Failed to initialize Admin SDK:", error);
        return false;
    }
}
export function getFirebaseMessaging() {
    if (!firebaseInitialized) {
        const initialized = initializeFirebase();
        if (!initialized)
            return null;
    }
    return getMessaging();
}
