/**
 * Storage Status Alert Component
 * 
 * Displays helpful information when localStorage is blocked
 * and provides tips to users on how to stay logged in
 */

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, AlertTriangle } from 'lucide-react';
import { isLocalStorageAvailable } from '@/lib/sessionStorage';

export const StorageStatusAlert = () => {
  const [showAlert, setShowAlert] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    const isAvailable = isLocalStorageAvailable();
    setStorageBlocked(!isAvailable);
    
    // Only show alert if localStorage is blocked
    if (!isAvailable) {
      setShowAlert(true);
    }
  }, []);

  if (!showAlert) {
    return null;
  }

  return (
    <>
      {storageBlocked ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Storage Blocked</AlertTitle>
          <AlertDescription>
            Your browser is blocking storage. You may be logged out when closing the browser.
            <ul className="list-disc ml-4 mt-2 text-sm">
              <li>Don't use Private/Incognito mode</li>
              <li>Enable cookies for this site in browser settings</li>
              <li>We're using cookies as a backup to keep you logged in</li>
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-4">
          <InfoIcon className="h-4 w-4" />
          <AlertTitle>Stay Logged In</AlertTitle>
          <AlertDescription>
            To keep your session active:
            <ul className="list-disc ml-4 mt-2 text-sm">
              <li>Don't use Private/Incognito mode</li>
              <li>Allow cookies for this site</li>
              <li>Don't clear browser data while logged in</li>
              <li>Use the app at least once every 2 weeks</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
