import arc.files.Fi;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Arrays;

/** Host-side Android API 21 storage MODEL. This is not ART, Android or an emulator. */
public final class AndroidModelSupport {
    private static Path root;
    private static Path statFailure, renameFailure;
    private static int statErrno;
    public static int statCalls, renameCalls, forbiddenToPathCalls;

    public static void configure(String directory) throws Exception {
        root = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(root);
        statFailure = renameFailure = null;
        statCalls = renameCalls = forbiddenToPathCalls = 0;
    }

    private static Path checked(String name) {
        Path value = Path.of(name).toAbsolutePath().normalize();
        if (root == null || !value.startsWith(root)) throw new IllegalArgumentException("Outside isolated Android model profile: " + value);
        return value;
    }

    private static Path relative(String name) { return checked(root.resolve(name).toString()); }
    public static String path(String name) { return relative(name).toString(); }
    public static Fi directory(String name) { return new Directory(relative(name).toFile()); }
    public static boolean exists(String name) { return Files.exists(relative(name)); }
    public static void mkdir(String name) throws Exception { Files.createDirectories(relative(name)); }
    public static void delete(String name) throws Exception { Files.deleteIfExists(relative(name)); }
    public static String read(String name) throws Exception { return Files.readString(relative(name), StandardCharsets.UTF_8); }
    public static byte[] bytes(String name) throws Exception { return Files.readAllBytes(relative(name)); }
    public static boolean unchanged(String name, byte[] before) throws Exception { return Arrays.equals(before, bytes(name)); }
    public static void write(String name, String text) throws Exception {
        Path target = relative(name); Files.createDirectories(target.getParent());
        Files.writeString(target, text, StandardCharsets.UTF_8);
    }
    public static void copy(String from, String to) throws Exception {
        Path target = relative(to); Files.createDirectories(target.getParent());
        Files.copy(relative(from), target, StandardCopyOption.REPLACE_EXISTING);
    }
    public static void malformedUtf8(String name) throws Exception {
        Path target = relative(name); Files.createDirectories(target.getParent());
        Files.write(target, new byte[]{'{', '"', 'x', '"', ':', '"', (byte) 0xc3, 0x28, '"', '}'});
    }
    public static void failStat(String name, int errno) { statFailure = relative(name); statErrno = errno; }
    public static void failRename(String name) { renameFailure = relative(name); }
    public static void clearFaults() { statFailure = renameFailure = null; statErrno = 0; }

    public static final class OsConstants {
        public static final int ENOENT = 2, EIO = 5, EACCES = 13, ENOTDIR = 20;
    }

    public static final class ErrnoException extends Exception {
        public final int errno;
        public ErrnoException(String operation, int errno) { super("MODELED " + operation + " errno=" + errno); this.errno = errno; }
    }

    public static final class Os {
        public static Object stat(String name) throws ErrnoException {
            Path path = checked(name); statCalls++;
            if (path.equals(statFailure)) throw new ErrnoException("stat", statErrno);
            try { return Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes.class); }
            catch (NoSuchFileException error) { throw new ErrnoException("stat", OsConstants.ENOENT); }
            catch (NotDirectoryException error) { throw new ErrnoException("stat", OsConstants.ENOTDIR); }
            catch (AccessDeniedException error) { throw new ErrnoException("stat", OsConstants.EACCES); }
            catch (Exception error) { throw new ErrnoException("stat", OsConstants.EIO); }
        }

        public static void rename(String oldName, String newName) throws ErrnoException {
            Path from = checked(oldName), to = checked(newName); renameCalls++;
            if (!from.getParent().equals(to.getParent())) throw new IllegalArgumentException("Model rename must be between siblings");
            if (to.equals(renameFailure)) throw new ErrnoException("rename", OsConstants.EACCES);
            try { Files.move(from, to, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (Exception error) { throw new ErrnoException("rename", OsConstants.EIO); }
        }
    }

    /** Catches accidental production File.toPath calls even on a host that supports it. */
    public static final class AndroidFile extends File {
        public AndroidFile(File value) { super(value.getPath()); }
        public Path toPath() {
            forbiddenToPathCalls++;
            throw new UnsupportedOperationException("MODELED Android API 21 has no File.toPath");
        }
    }

    public static final class Directory extends Fi {
        private final File value;
        public Directory(File value) { super(value); this.value = value; }
        public Fi child(String name) { return new Directory(new File(value, name)); }
        public File file() { return new AndroidFile(value); }
    }
}
