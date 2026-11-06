// Decompile whole classes (annotations included, e.g. Retrofit @GET paths) using the JADX library inside the REA bridge JAR.
// Run:  java -cp "$REA_JADX_MCP_JAR" Decompile.java <apk> <outfile|-> [--list] <class-prefix>...
// --list prints class names matching the prefixes instead of source.
// --contains <text> (repeatable) decompiles EVERY class and prints only those whose source contains the text - the way to find
// obfuscated classes (e.g. a Retrofit interface) from a string you saw in the DEX. Slow on big apps; combine with --threads 4.
// Static only: nothing is executed.
import jadx.api.*;
import java.io.*;
import java.util.*;

public class Decompile {
    public static void main(String[] a) throws Exception {
        boolean list = false; int threads = 1; List<String> prefixes = new ArrayList<>(), needles = new ArrayList<>();
        for (int i = 2; i < a.length; i++) {
            if (a[i].equals("--list")) list = true;
            else if (a[i].equals("--contains") && i + 1 < a.length) needles.add(a[++i]);
            else if (a[i].equals("--threads") && i + 1 < a.length) threads = Integer.parseInt(a[++i]);
            else prefixes.add(a[i]);
        }
        JadxArgs args = new JadxArgs();
        args.setInputFiles(Collections.singletonList(new File(a[0])));
        args.setSkipResources(true); args.setThreadsCount(threads);
        PrintStream out = a[1].equals("-") ? System.out : new PrintStream(new FileOutputStream(a[1]), false, "UTF-8");
        try (JadxDecompiler j = new JadxDecompiler(args)) {
            j.load();
            for (JavaClass c : j.getClasses()) {
                boolean hit = prefixes.isEmpty(); for (String p : prefixes) if (c.getFullName().startsWith(p)) hit = true;
                if (!hit) continue;
                if (list) { out.println(c.getFullName()); continue; }
                String code = c.getCode();
                if (!needles.isEmpty()) { boolean any = false; for (String n : needles) if (code.contains(n)) any = true; if (!any) continue; }
                out.println("//// " + c.getFullName()); out.println(code);
            }
        }
        out.flush();
    }
}
