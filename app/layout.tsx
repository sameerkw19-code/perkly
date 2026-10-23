import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Perkly | כרטיס קטן. קשר גדול.',description:'כרטיסי נאמנות דיגיטליים לעסקים',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="he" dir="rtl"><body>{children}</body></html>}
