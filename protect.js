import { supabase, isConfigured, requireUser, profileFor } from "./supabase.js";
const session=await requireUser(); if(session){try{const profile=await profileFor(session.user);document.documentElement.dataset.kstRole=profile?.role||"customer";document.documentElement.dataset.kstUser=session.user.id;}catch(e){console.error("Profile lookup failed",e);}}
